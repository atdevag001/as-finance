import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DocumentService,
  detectMimeType,
  isFileSizeValid,
} from '../document.service';
import { ValidationError, NotFoundError } from '../../../common/errors';

// --- Pure function tests ---

describe('detectMimeType', () => {
  it('should detect JPEG from magic bytes FF D8 FF', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    expect(detectMimeType(buf)).toBe('image/jpeg');
  });

  it('should detect PNG from magic bytes 89 50 4E 47', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(detectMimeType(buf)).toBe('image/png');
  });

  it('should detect PDF from magic bytes 25 50 44 46 (%PDF)', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(detectMimeType(buf)).toBe('application/pdf');
  });

  it('should return null for unknown magic bytes', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(detectMimeType(buf)).toBeNull();
  });

  it('should return null for empty buffer', () => {
    const buf = Buffer.alloc(0);
    expect(detectMimeType(buf)).toBeNull();
  });

  it('should return null for buffer shorter than any signature', () => {
    const buf = Buffer.from([0xff, 0xd8]);
    expect(detectMimeType(buf)).toBeNull();
  });

  it('should detect JPEG even with minimal matching bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff]);
    expect(detectMimeType(buf)).toBe('image/jpeg');
  });
});

describe('isFileSizeValid', () => {
  it('should accept file exactly at 5MB limit', () => {
    expect(isFileSizeValid(5 * 1024 * 1024)).toBe(true);
  });

  it('should accept file under 5MB', () => {
    expect(isFileSizeValid(1024)).toBe(true);
  });

  it('should reject file over 5MB', () => {
    expect(isFileSizeValid(5 * 1024 * 1024 + 1)).toBe(false);
  });

  it('should reject zero-byte file', () => {
    expect(isFileSizeValid(0)).toBe(false);
  });

  it('should reject negative size', () => {
    expect(isFileSizeValid(-1)).toBe(false);
  });

  it('should accept 1 byte file', () => {
    expect(isFileSizeValid(1)).toBe(true);
  });
});


// --- DocumentService integration-style unit tests (mocked dependencies) ---

const mockFileId = '550e8400-e29b-41d4-a716-446655440000';
const mockActorId = '660e8400-e29b-41d4-a716-446655440001';

function createMockPrisma() {
  return {
    file_metadata: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

function createMockStorage() {
  return {
    upload: vi.fn().mockResolvedValue(undefined),
    getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/signed-url'),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  return {
    fieldname: 'file',
    originalname: 'test-photo.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    buffer: jpegBuffer,
    size: jpegBuffer.length,
    stream: null as never,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

describe('DocumentService', () => {
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

  describe('upload', () => {
    it('should upload a valid JPEG file and create metadata', async () => {
      const mockMetadata = {
        id: mockFileId,
        original_filename: 'test-photo.jpg',
        stored_filename: 'some-uuid.jpg',
        mime_type: 'image/jpeg',
        size_bytes: 6,
        bucket: 'test-bucket',
        key: 'kyc/some-uuid.jpg',
        uploaded_by: mockActorId,
        is_active: true,
        created_at: new Date(),
      };
      mockPrisma.file_metadata.create.mockResolvedValue(mockMetadata);

      const file = createMockFile();
      const result = await service.upload(file, { prefix: 'kyc' }, mockActorId);

      expect(result).toBeDefined();
      expect(result.mime_type).toBe('image/jpeg');
      expect(mockStorage.upload).toHaveBeenCalledOnce();
      expect(mockPrisma.file_metadata.create).toHaveBeenCalledOnce();

      const createCall = mockPrisma.file_metadata.create.mock.calls[0]![0];
      expect(createCall.data.mime_type).toBe('image/jpeg');
      expect(createCall.data.bucket).toBe('test-bucket');
      expect(createCall.data.key).toMatch(/^kyc\/.+\.jpg$/);
      expect(createCall.data.uploaded_by).toBe(mockActorId);
    });

    it('should upload a valid PNG file', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
      const file = createMockFile({
        buffer: pngBuffer,
        size: pngBuffer.length,
        originalname: 'photo.png',
        mimetype: 'image/png',
      });
      mockPrisma.file_metadata.create.mockResolvedValue({ id: mockFileId });

      await service.upload(file, { prefix: 'kyc' }, mockActorId);

      const createCall = mockPrisma.file_metadata.create.mock.calls[0]![0];
      expect(createCall.data.mime_type).toBe('image/png');
      expect(createCall.data.key).toMatch(/^kyc\/.+\.png$/);
    });

    it('should upload a valid PDF file', async () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
      const file = createMockFile({
        buffer: pdfBuffer,
        size: pdfBuffer.length,
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
      });
      mockPrisma.file_metadata.create.mockResolvedValue({ id: mockFileId });

      await service.upload(file, { prefix: 'loan-docs' }, mockActorId);

      const createCall = mockPrisma.file_metadata.create.mock.calls[0]![0];
      expect(createCall.data.mime_type).toBe('application/pdf');
      expect(createCall.data.key).toMatch(/^loan-docs\/.+\.pdf$/);
    });

    it('should reject file exceeding 5MB', async () => {
      const file = createMockFile({ size: 5 * 1024 * 1024 + 1 });

      await expect(
        service.upload(file, { prefix: 'kyc' }, mockActorId),
      ).rejects.toThrow(ValidationError);

      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(mockPrisma.file_metadata.create).not.toHaveBeenCalled();
    });

    it('should reject file with invalid MIME type (magic bytes)', async () => {
      const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05]);
      const file = createMockFile({
        buffer: invalidBuffer,
        size: invalidBuffer.length,
        mimetype: 'application/octet-stream',
      });

      await expect(
        service.upload(file, { prefix: 'kyc' }, mockActorId),
      ).rejects.toThrow(ValidationError);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('should reject invalid prefix', async () => {
      const file = createMockFile();

      await expect(
        service.upload(file, { prefix: 'invalid' as never }, mockActorId),
      ).rejects.toThrow(ValidationError);
    });

    it('should generate unique stored filenames (UUID-based)', async () => {
      mockPrisma.file_metadata.create.mockResolvedValue({ id: mockFileId });
      const file = createMockFile();

      await service.upload(file, { prefix: 'kyc' }, mockActorId);
      await service.upload(file, { prefix: 'kyc' }, mockActorId);

      const key1 = mockPrisma.file_metadata.create.mock.calls[0]![0].data.key;
      const key2 = mockPrisma.file_metadata.create.mock.calls[1]![0].data.key;
      expect(key1).not.toBe(key2);
    });
  });

  describe('getSignedUrl', () => {
    it('should return a signed URL for an active document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: mockFileId,
        bucket: 'test-bucket',
        key: 'kyc/some-file.jpg',
        is_active: true,
      });

      const url = await service.getSignedUrl(mockFileId, mockActorId);

      expect(url).toBe('https://s3.example.com/signed-url');
      expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
        'test-bucket',
        'kyc/some-file.jpg',
        900,
      );
    });

    it('should throw NotFoundError for non-existent document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue(null);

      await expect(
        service.getSignedUrl(mockFileId, mockActorId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for soft-deleted document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: mockFileId,
        is_active: false,
      });

      await expect(
        service.getSignedUrl(mockFileId, mockActorId),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('softDelete', () => {
    it('should set is_active to false', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: mockFileId,
        is_active: true,
      });
      mockPrisma.file_metadata.update.mockResolvedValue({});

      await service.softDelete(mockFileId, mockActorId);

      expect(mockPrisma.file_metadata.update).toHaveBeenCalledWith({
        where: { id: mockFileId },
        data: { is_active: false },
      });
    });

    it('should throw NotFoundError for non-existent document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue(null);

      await expect(
        service.softDelete(mockFileId, mockActorId),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
