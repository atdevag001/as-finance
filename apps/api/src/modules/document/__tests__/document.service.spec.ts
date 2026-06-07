import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DocumentService,
  detectMimeType,
  isFileSizeValid,
} from '../document.service';
import { S3StorageService } from '../storage.service';
import { ValidationError, NotFoundError } from '../../../common/errors';

/**
 * Unit tests for DocumentService and S3StorageService.
 *
 * Validates: Requirements 57.6, 57.7, 57.8, 57.9, 57.10
 */

// --- Helpers ---

const mockFileId = '550e8400-e29b-41d4-a716-446655440000';
const mockActorId = '660e8400-e29b-41d4-a716-446655440001';

function createMockPrisma() {
  const mock: any = {
    file_metadata: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    customer_documents: {
      create: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    audit_logs: {
      create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
    },
  };
  // $transaction supports both array (softDelete) and callback (upload) forms,
  // mirroring PrismaClient. The mock just executes them against itself.
  mock.$transaction = vi.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: typeof mock) => Promise<unknown>)(mock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return mock;
}

// Unrestricted role bypasses scope check in loadMetadataWithScope; safe default for tests.
const mockActorRole = 'super_admin';

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

// --- Pure function smoke tests (detailed coverage in document-helpers.spec.ts) ---

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
    expect(detectMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('should return null for buffer shorter than any signature', () => {
    const buf = Buffer.from([0xff, 0xd8]);
    expect(detectMimeType(buf)).toBeNull();
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

// --- DocumentService unit tests (mocked dependencies) ---

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
      const result = await service.upload(file, { prefix: 'kyc' }, mockActorId, mockActorRole);

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

      await service.upload(file, { prefix: 'kyc' }, mockActorId, mockActorRole);

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

      await service.upload(file, { prefix: 'loan-docs' }, mockActorId, mockActorRole);

      const createCall = mockPrisma.file_metadata.create.mock.calls[0]![0];
      expect(createCall.data.mime_type).toBe('application/pdf');
      expect(createCall.data.key).toMatch(/^loan-docs\/.+\.pdf$/);
    });

    it('should reject file exceeding 5MB', async () => {
      const file = createMockFile({ size: 5 * 1024 * 1024 + 1 });

      await expect(
        service.upload(file, { prefix: 'kyc' }, mockActorId, mockActorRole),
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
        service.upload(file, { prefix: 'kyc' }, mockActorId, mockActorRole),
      ).rejects.toThrow(ValidationError);

      expect(mockStorage.upload).not.toHaveBeenCalled();
    });

    it('should reject file containing embedded scripts', async () => {
      // Build a buffer that has valid JPEG magic bytes but also contains a script tag
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const scriptPayload = Buffer.from('<script>alert("xss")</script>');
      const maliciousBuffer = Buffer.concat([jpegHeader, scriptPayload]);
      const file = createMockFile({
        buffer: maliciousBuffer,
        size: maliciousBuffer.length,
      });

      await expect(
        service.upload(file, { prefix: 'kyc' }, mockActorId, mockActorRole),
      ).rejects.toThrow(ValidationError);

      expect(mockStorage.upload).not.toHaveBeenCalled();
      expect(mockPrisma.file_metadata.create).not.toHaveBeenCalled();
    });

    it('should reject invalid prefix', async () => {
      const file = createMockFile();

      await expect(
        service.upload(file, { prefix: 'invalid' as never }, mockActorId, mockActorRole),
      ).rejects.toThrow(ValidationError);
    });

    it('should generate unique stored filenames (UUID-based)', async () => {
      mockPrisma.file_metadata.create.mockResolvedValue({ id: mockFileId });
      const file = createMockFile();

      await service.upload(file, { prefix: 'kyc' }, mockActorId, mockActorRole);
      await service.upload(file, { prefix: 'kyc' }, mockActorId, mockActorRole);

      const key1 = mockPrisma.file_metadata.create.mock.calls[0]![0].data.key;
      const key2 = mockPrisma.file_metadata.create.mock.calls[1]![0].data.key;
      expect(key1).not.toBe(key2);
    });

    it('should pass correct params to S3 storage upload', async () => {
      mockPrisma.file_metadata.create.mockResolvedValue({ id: mockFileId });
      const file = createMockFile();

      await service.upload(file, { prefix: 'receipts' }, mockActorId, mockActorRole);

      expect(mockStorage.upload).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: 'test-bucket',
          body: file.buffer,
          contentType: 'image/jpeg',
        }),
      );
      const uploadCall = mockStorage.upload.mock.calls[0]![0];
      expect(uploadCall.key).toMatch(/^receipts\/.+\.jpg$/);
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

      const url = await service.getSignedUrl(mockFileId, mockActorId, mockActorRole);

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
        service.getSignedUrl(mockFileId, mockActorId, mockActorRole),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError for soft-deleted (inactive) document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: mockFileId,
        is_active: false,
      });

      await expect(
        service.getSignedUrl(mockFileId, mockActorId, mockActorRole),
      ).rejects.toThrow(NotFoundError);
    });

    it('should request 15-minute (900s) expiry for signed URLs', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: mockFileId,
        bucket: 'test-bucket',
        key: 'kyc/file.jpg',
        is_active: true,
      });

      await service.getSignedUrl(mockFileId, mockActorId, mockActorRole);

      expect(mockStorage.getSignedUrl).toHaveBeenCalledWith(
        'test-bucket',
        'kyc/file.jpg',
        900,
      );
    });
  });

  describe('softDelete', () => {
    it('should set is_active to false', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: mockFileId,
        is_active: true,
      });
      mockPrisma.file_metadata.update.mockResolvedValue({});

      await service.softDelete(mockFileId, mockActorId, mockActorRole);

      expect(mockPrisma.file_metadata.update).toHaveBeenCalledWith({
        where: { id: mockFileId },
        data: { is_active: false },
      });
    });

    it('should not call S3 delete (file retained for compliance)', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue({
        id: mockFileId,
        is_active: true,
      });
      mockPrisma.file_metadata.update.mockResolvedValue({});

      await service.softDelete(mockFileId, mockActorId, mockActorRole);

      expect(mockStorage.delete).not.toHaveBeenCalled();
    });

    it('should throw NotFoundError for non-existent document', async () => {
      mockPrisma.file_metadata.findUnique.mockResolvedValue(null);

      await expect(
        service.softDelete(mockFileId, mockActorId, mockActorRole),
      ).rejects.toThrow(NotFoundError);
    });
  });
});


// --- S3StorageService unit tests (mocked S3Client) ---

// Mock the AWS SDK modules before importing S3StorageService
vi.mock('@aws-sdk/client-s3', () => {
  const mockSend = vi.fn().mockResolvedValue({});
  const MockS3Client = vi.fn().mockImplementation(() => ({ send: mockSend }));
  // Expose send on the class for test access
  (MockS3Client as any).__mockSend = mockSend;

  return {
    S3Client: MockS3Client,
    PutObjectCommand: vi.fn().mockImplementation((input: any) => ({ ...input, _type: 'PutObject' })),
    GetObjectCommand: vi.fn().mockImplementation((input: any) => ({ ...input, _type: 'GetObject' })),
    DeleteObjectCommand: vi.fn().mockImplementation((input: any) => ({ ...input, _type: 'DeleteObject' })),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/presigned-url'),
}));

describe('S3StorageService', () => {
  let storageService: S3StorageService;
  let mockSend: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env['S3_ENDPOINT'] = 'http://localhost:9000';
    process.env['S3_REGION'] = 'us-east-1';
    process.env['S3_ACCESS_KEY'] = 'test-key';
    process.env['S3_SECRET_KEY'] = 'test-secret';

    // Re-import to get fresh instance with mocked S3Client
    const { S3Client } = await import('@aws-sdk/client-s3');
    mockSend = (S3Client as any).__mockSend;
    mockSend.mockResolvedValue({});

    storageService = new S3StorageService();
  });

  describe('upload', () => {
    it('should send PutObjectCommand with correct parameters', async () => {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      const body = Buffer.from([0xff, 0xd8, 0xff]);

      await storageService.upload({
        bucket: 'test-bucket',
        key: 'kyc/test-file.jpg',
        body,
        contentType: 'image/jpeg',
      });

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'kyc/test-file.jpg',
        Body: body,
        ContentType: 'image/jpeg',
      });
      expect(mockSend).toHaveBeenCalledOnce();
    });
  });

  describe('getSignedUrl', () => {
    it('should generate a presigned URL with correct parameters', async () => {
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { getSignedUrl: mockGetSignedUrl } = await import('@aws-sdk/s3-request-presigner');

      const url = await storageService.getSignedUrl('test-bucket', 'kyc/file.jpg', 900);

      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'kyc/file.jpg',
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(), // S3Client instance
        expect.objectContaining({ Bucket: 'test-bucket', Key: 'kyc/file.jpg' }),
        { expiresIn: 900 },
      );
      expect(url).toBe('https://s3.example.com/presigned-url');
    });
  });

  describe('delete', () => {
    it('should send DeleteObjectCommand with correct parameters', async () => {
      const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');

      await storageService.delete('test-bucket', 'kyc/old-file.jpg');

      expect(DeleteObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'kyc/old-file.jpg',
      });
      expect(mockSend).toHaveBeenCalledOnce();
    });
  });
});
