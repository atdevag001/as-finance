import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DocumentService,
  detectMimeType,
  isFileSizeValid,
  containsEmbeddedScripts,
} from '../document.service';
import { ValidationError, NotFoundError } from '../../../common/errors';

/**
 * Document Upload Integration Tests with S3 Mock (Task 32.1)
 *
 * Tests the full upload flow: validate MIME → validate size → scan scripts →
 * upload to S3 → create metadata record. Also tests signed URL generation
 * and soft delete flow.
 *
 * Validates: Requirements 53.8, 57.6, 57.7, 57.8, 57.9, 76.3
 */

const VALID_PREFIXES = ['kyc', 'loan-docs', 'receipts', 'expenses'];

function createMockPrisma() {
  return {
    file_metadata: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
    },
    customer_documents: {
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };
}

function createMockStorage() {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed-url?expires=900'),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createJpegFile(size?: number): Express.Multer.File {
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const padding = size ? Buffer.alloc(Math.max(0, size - jpegHeader.length)) : Buffer.alloc(100);
  const buffer = Buffer.concat([jpegHeader, padding]);
  return {
    fieldname: 'file',
    originalname: 'photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer,
    size: buffer.length,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
  };
}

function createPngFile(): Express.Multer.File {
  const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(100).fill(0)]);
  return {
    fieldname: 'file',
    originalname: 'image.png',
    encoding: '7bit',
    mimetype: 'image/png',
    buffer,
    size: buffer.length,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
  };
}

function createPdfFile(): Express.Multer.File {
  const buffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, ...Array(100).fill(0)]);
  return {
    fieldname: 'file',
    originalname: 'document.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    buffer,
    size: buffer.length,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
  };
}

const actorId = 'actor-upload-test';

describe('Document Upload Integration (S3 Mock)', () => {
  let service: DocumentService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['S3_BUCKET'] = 'test-bucket';
    mockPrisma = createMockPrisma();
    mockStorage = createMockStorage();
    service = new DocumentService(mockPrisma as never, mockStorage as never);
  });

  describe('full upload flow: validate MIME → validate size → scan scripts → upload → create metadata (Req 53.8)', () => {
    it('JPEG upload: validates, uploads to S3, creates metadata record', async () => {
      const fileId = 'file-jpeg-1';
      mockPrisma.file_metadata.create.mockResolvedValue({
        id: fileId,
        mime_type: 'image/jpeg',
        is_active: true,
        bucket: 'test-bucket',
      });

      const file = createJpegFile();
      const result = await service.upload(file, { prefix: 'kyc' }, actorId);

      expect(result).toBeDefined();
      expect(result.mime_type).toBe('image/jpeg');
      expect(mockStorage.upload).toHaveBeenCalledOnce();
      expect(mockPrisma.file_metadata.create).toHaveBeenCalledOnce();

      const createData = mockPrisma.file_metadata.create.mock.calls[0]![0].data;
      expect(createData.mime_type).toBe('image/jpeg');
      expect(createData.bucket).toBe('test-bucket');
      expect(createData.key).toMatch(/^kyc\//);
      expect(createData.uploaded_by).toBe(actorId);
      // is_active defaults to true at DB level; service may or may not set it explicitly
      if (createData.is_active !== undefined) {
        expect(createData.is_active).toBe(true);
      }
    });

    it('PNG upload: validates and creates correct metadata', async () => {
      mockPrisma.file_metadata.create.mockResolvedValue({
        id: 'file-png-1',
        mime_type: 'image/png',
        is_active: true,
      });

      const file = createPngFile();
      const result = await service.upload(file, { prefix: 'kyc' }, actorId);

      expect(result.mime_type).toBe('image/png');
      expect(mockStorage.upload).toHaveBeenCalledOnce();
    });

    it('PDF upload: validates and creates correct metadata', async () => {
      mockPrisma.file_metadata.create.mockResolvedValue({
        id: 'file-pdf-1',
        mime_type: 'application/pdf',
        is_active: true,
      });

      const file = createPdfFile();
      const result = await service.upload(file, { prefix: 'loan-docs' }, actorId);

      expect(result.mime_type).toBe('application/pdf');
      const createData = mockPrisma.file_metadata.create.mock.calls[0]![0].data;
      expect(createData.key).toMatch(/^loan-docs\//);
    });

    it('rejects invalid MIME type (unknown magic bytes)', async () => {
      const file = createJpegFile();
      file.buffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      file.size = file.buffer.length;

      await expect(service.upload(file, { prefix: 'kyc' }, actorId)).rejects.toThrow(ValidationError);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('rejects oversized file (>5MB)', async () => {
      const file = createJpegFile(5 * 1024 * 1024 + 1);

      await expect(service.upload(file, { prefix: 'kyc' }, actorId)).rejects.toThrow(ValidationError);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('rejects file with embedded scripts', async () => {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const scriptPayload = Buffer.from('<script>alert("xss")</script>');
      const malicious = Buffer.concat([jpegHeader, scriptPayload]);
      const file = createJpegFile();
      file.buffer = malicious;
      file.size = malicious.length;

      await expect(service.upload(file, { prefix: 'kyc' }, actorId)).rejects.toThrow(ValidationError);
      expect(mockStorage.upload).not.toHaveBeenCalled();
    });
  });

  describe('upload with each valid prefix (Req 57.6)', () => {
    for (const prefix of VALID_PREFIXES) {
      it(`accepts prefix '${prefix}'`, async () => {
        mockPrisma.file_metadata.create.mockResolvedValue({
          id: `file-${prefix}`,
          mime_type: 'image/jpeg',
          is_active: true,
        });

        const file = createJpegFile();
        const result = await service.upload(file, { prefix: prefix as any }, actorId);

        expect(result).toBeDefined();
        const createData = mockPrisma.file_metadata.create.mock.calls[0]![0].data;
        expect(createData.key).toMatch(new RegExp(`^${prefix}/`));
      });
    }

    it('rejects invalid prefix', async () => {
      const file = createJpegFile();
      await expect(
        service.upload(file, { prefix: 'invalid-prefix' as any }, actorId),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('signed URL generation with 15-minute expiry (Req 57.8)', () => {
    it('generates signed URL for active document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: 'file-1',
        bucket: 'test-bucket',
        key: 'kyc/file.jpg',
        is_active: true,
      });

      const url = await service.getSignedUrl('file-1', actorId, 'super_admin');

      expect(url).toContain('signed-url');
      expect(mockStorage.getSignedUrl).toHaveBeenCalledWith('test-bucket', 'kyc/file.jpg', 900);
    });

    it('rejects signed URL for inactive (soft-deleted) document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: 'file-1',
        is_active: false,
      });

      await expect(service.getSignedUrl('file-1', actorId, 'super_admin')).rejects.toThrow(NotFoundError);
    });
  });

  describe('soft delete flow (Req 57.9, 76.3)', () => {
    it('sets is_active=false and retains file in S3', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: 'file-1',
        is_active: true,
      });
      mockPrisma.file_metadata.update.mockResolvedValue({});

      await service.softDelete('file-1', actorId, 'super_admin');

      expect(mockPrisma.file_metadata.update).toHaveBeenCalledWith({
        where: { id: 'file-1' },
        data: { is_active: false },
      });
      // File NOT deleted from S3 — retained for compliance
      expect(mockStorage.delete).not.toHaveBeenCalled();
    });

    it('rejects soft delete for non-existent document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue(null);

      await expect(service.softDelete('nonexistent', actorId, 'super_admin')).rejects.toThrow(NotFoundError);
    });
  });
});
