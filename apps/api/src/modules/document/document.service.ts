import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { S3StorageService } from './storage.service';
import { ValidationError, NotFoundError } from '../../common/errors';

/** Maximum file size: 5 MB */
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

/** Allowed MIME types with their magic byte signatures */
const MIME_SIGNATURES: { mime: string; bytes: number[] }[] = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

/** Patterns that indicate embedded scripts in uploaded files */
const SCRIPT_PATTERNS = [
  /<script[\s>]/i,
  /javascript:/i,
  /on\w+\s*=/i,       // onclick=, onerror=, etc.
  /<%/,                // Server-side template injection
  /<\?php/i,
];

/** Valid upload prefixes (document categories) */
const VALID_PREFIXES = ['kyc', 'loan-docs', 'receipts', 'expenses'] as const;
export type DocumentPrefix = (typeof VALID_PREFIXES)[number];

export interface UploadDocumentDto {
  prefix: DocumentPrefix;
}

/**
 * Detects MIME type from file buffer magic bytes.
 * Returns the detected MIME type or null if unrecognized.
 */
export function detectMimeType(buffer: Buffer): string | null {
  for (const sig of MIME_SIGNATURES) {
    if (buffer.length >= sig.bytes.length) {
      const match = sig.bytes.every((byte, i) => buffer[i] === byte);
      if (match) return sig.mime;
    }
  }
  return null;
}

/**
 * Validates file size is within the allowed limit.
 * Returns true if valid, false if too large.
 */
export function isFileSizeValid(sizeBytes: number): boolean {
  return sizeBytes > 0 && sizeBytes <= MAX_FILE_SIZE_BYTES;
}

/**
 * Scans file buffer for embedded script patterns.
 * Returns true if suspicious content is detected.
 */
export function containsEmbeddedScripts(buffer: Buffer): boolean {
  // Only scan text-readable portions (first 8KB is sufficient for detection)
  const sample = buffer.subarray(0, 8192).toString('utf-8');
  return SCRIPT_PATTERNS.some((pattern) => pattern.test(sample));
}

@Injectable()
export class DocumentService {
  private readonly bucket: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
  ) {
    this.bucket = process.env['S3_BUCKET'] || 'as-finance-docs';
  }

  /**
   * Upload a document with server-side MIME validation via magic bytes,
   * file size validation, randomized filename, and S3 storage.
   */
  async upload(
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    actorId: string,
  ) {
    // Validate file size
    if (!isFileSizeValid(file.size)) {
      throw new ValidationError(
        `File size ${file.size} bytes exceeds maximum allowed size of ${MAX_FILE_SIZE_BYTES} bytes (5MB)`,
      );
    }

    // Validate MIME type via magic bytes
    const detectedMime = detectMimeType(file.buffer);
    if (!detectedMime) {
      throw new ValidationError(
        'Invalid file type. Only JPEG, PNG, and PDF files are allowed',
      );
    }

    // Scan for embedded scripts (e.g., script injection in images/PDFs)
    if (containsEmbeddedScripts(file.buffer)) {
      throw new ValidationError(
        'File contains suspicious embedded content and was rejected',
      );
    }

    // Validate prefix
    if (!VALID_PREFIXES.includes(dto.prefix as DocumentPrefix)) {
      throw new ValidationError(
        `Invalid prefix "${dto.prefix}". Must be one of: ${VALID_PREFIXES.join(', ')}`,
      );
    }

    // Generate randomized filename preserving extension
    const ext = this.getExtension(detectedMime);
    const storedFilename = `${randomUUID()}${ext}`;
    const key = `${dto.prefix}/${storedFilename}`;

    // Upload to S3
    await this.storage.upload({
      bucket: this.bucket,
      key,
      body: file.buffer,
      contentType: detectedMime,
    });

    // Create file_metadata record
    const metadata = await this.prisma.file_metadata.create({
      data: {
        original_filename: file.originalname,
        stored_filename: storedFilename,
        mime_type: detectedMime,
        size_bytes: file.size,
        bucket: this.bucket,
        key,
        uploaded_by: actorId,
      },
    });

    return metadata;
  }

  /**
   * Generate a signed URL for a document with 15-minute expiry.
   * Validates the document exists and is active.
   */
  async getSignedUrl(fileId: string, _actorId: string): Promise<string> {
    const metadata = await this.prisma.file_metadata.findUnique({
      where: { id: fileId },
    });

    if (!metadata || !metadata.is_active) {
      throw new NotFoundError('Document not found');
    }

    // 15-minute expiry (900 seconds)
    const signedUrl = await this.storage.getSignedUrl(
      metadata.bucket,
      metadata.key,
      900,
    );

    return signedUrl;
  }

  /**
   * Soft delete a document by setting is_active=false.
   * The file is retained in S3 for compliance.
   */
  async softDelete(fileId: string, _actorId: string): Promise<void> {
    const metadata = await this.prisma.file_metadata.findUnique({
      where: { id: fileId },
    });

    if (!metadata) {
      throw new NotFoundError('Document not found');
    }

    await this.prisma.file_metadata.update({
      where: { id: fileId },
      data: { is_active: false },
    });
  }

  private getExtension(mimeType: string): string {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'application/pdf':
        return '.pdf';
      default:
        return '';
    }
  }
}
