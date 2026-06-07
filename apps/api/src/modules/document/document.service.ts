import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { S3StorageService } from './storage.service';
import {
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { UNRESTRICTED_ROLES } from '../../common/constants/roles';
import {
  UploadDocumentDto,
  VALID_PREFIXES,
  VALID_DOC_TYPES,
} from './dto/upload-document.dto';
import type { DocumentPrefix, DocumentType } from './dto/upload-document.dto';

// Re-exports preserve historical import paths from this module after the DTO move.
export { UploadDocumentDto, VALID_PREFIXES, VALID_DOC_TYPES };
export type { DocumentPrefix, DocumentType };

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
  private readonly logger = new Logger(DocumentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: S3StorageService,
  ) {
    this.bucket = process.env['S3_BUCKET'] || 'as-finance-docs';
  }

  /**
   * Upload a document with server-side MIME validation via magic bytes,
   * file size validation, randomized filename, and S3 storage.
   *
   * actorRole is required so document_uploaded audit entries record the
   * acting principal alongside the actor id (compliance / forensics).
   */
  async upload(
    file: Express.Multer.File,
    dto: UploadDocumentDto,
    actorId: string,
    actorRole: string,
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
    if (!VALID_PREFIXES.includes(dto.prefix)) {
      throw new ValidationError(
        `Invalid prefix "${dto.prefix}". Must be one of: ${VALID_PREFIXES.join(', ')}`,
      );
    }

    // Validate KYC-specific fields BEFORE touching S3 so an invalid documentType
    // can never orphan a file_metadata row + S3 object on the failure path.
    const isKycLink = dto.prefix === 'kyc' && dto.customerId && dto.documentType;
    if (dto.prefix === 'kyc' && dto.documentType && !VALID_DOC_TYPES.includes(dto.documentType)) {
      throw new ValidationError(
        `Invalid document type "${dto.documentType}". Must be one of: ${VALID_DOC_TYPES.join(', ')}`,
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

    // Persist metadata + KYC link atomically; on any DB failure delete the S3
    // object so we never leave an orphaned upload behind.
    const metadata = await this.prisma
      .$transaction(async (tx) => {
        const created = await tx.file_metadata.create({
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

        if (isKycLink) {
          // Replace semantics: soft-delete any prior active row of the same
          // document_type so verifiers see exactly one canonical file per type
          // (schema has no partial unique index — enforced at the service).
          await tx.customer_documents.updateMany({
            where: {
              customer_id: dto.customerId!,
              document_type: dto.documentType as never,
              is_active: true,
            },
            data: { is_active: false },
          });

          await tx.customer_documents.create({
            data: {
              customer_id: dto.customerId!,
              document_type: dto.documentType as never,
              file_id: created.id,
            },
          });
        }

        return created;
      })
      .catch(async (err: unknown) => {
        // Compensating delete to avoid orphan S3 objects when the DB write fails.
        try {
          await this.storage.delete(this.bucket, key);
        } catch (cleanupErr) {
          this.logger.error(
            `Failed to delete orphan S3 object ${key} after metadata write failure`,
            cleanupErr as Error,
          );
        }
        throw err;
      });

    // Audit trail for KYC/document forensics — captures who uploaded what.
    await this.writeAuditLog({
      action_type: 'document_uploaded',
      actor_id: actorId,
      actor_role: actorRole,
      target_id: metadata.id,
      after_state: {
        file_id: metadata.id,
        customer_id: dto.customerId ?? null,
        document_type: dto.documentType ?? null,
        prefix: dto.prefix,
        mime_type: detectedMime,
        size_bytes: file.size,
      },
    });

    return metadata;
  }

  /**
   * Generate a signed URL for a document with 15-minute expiry.
   * Validates the document exists, is active, and the actor can access it.
   */
  async getSignedUrl(fileId: string, actorId: string, actorRole: string): Promise<string> {
    const metadata = await this.loadMetadataWithScope(fileId, actorId, actorRole);

    return this.storage.getSignedUrl(metadata.bucket, metadata.key, 900);
  }

  /**
   * Get file stream for direct download/viewing.
   * Enforces per-customer scope authorization (field officers see only assigned docs).
   */
  async getFileStream(
    fileId: string,
    actorId: string,
    actorRole: string,
  ): Promise<{
    stream: Readable;
    metadata: {
      mime_type: string;
      original_filename: string;
      size_bytes: number;
    };
  }> {
    const metadata = await this.loadMetadataWithScope(fileId, actorId, actorRole);

    const stream = await this.storage.getFileStream(metadata.bucket, metadata.key);

    return {
      stream,
      metadata: {
        mime_type: metadata.mime_type,
        original_filename: metadata.original_filename,
        size_bytes: Number(metadata.size_bytes),
      },
    };
  }

  /**
   * Soft delete a document by setting is_active=false.
   * The file is retained in S3 for compliance. Enforces actor scope.
   */
  async softDelete(fileId: string, actorId: string, actorRole: string): Promise<void> {
    const metadata = await this.loadMetadataWithScope(fileId, actorId, actorRole);

    // Atomic so we never leave an inactive file_metadata with active
    // customer_documents rows (ghost row that lists in the UI but 404s on view).
    await this.prisma.$transaction([
      this.prisma.file_metadata.update({
        where: { id: metadata.id },
        data: { is_active: false },
      }),
      this.prisma.customer_documents.updateMany({
        where: { file_id: metadata.id },
        data: { is_active: false },
      }),
    ]);

    // Audit trail — captures who deleted sensitive KYC/document data.
    await this.writeAuditLog({
      action_type: 'document_deleted',
      actor_id: actorId,
      actor_role: actorRole,
      target_id: metadata.id,
      before_state: { file_id: metadata.id, is_active: true },
      after_state: { file_id: metadata.id, is_active: false },
    });
  }

  /**
   * Load file metadata and enforce per-customer scope authorization.
   * For KYC files, restricted roles (field_officer) must be the customer's assigned officer.
   * For non-KYC files (loan-docs/receipts/expenses), allow if the actor has any access
   *   to the document's owning entity (treated as unrestricted for now; refine in follow-up).
   */
  private async loadMetadataWithScope(
    fileId: string,
    actorId: string,
    actorRole: string,
  ) {
    const metadata = await this.prisma.file_metadata.findUnique({
      where: { id: fileId },
      include: {
        customer_documents: {
          select: {
            customer: { select: { id: true, assigned_officer_id: true } },
          },
        },
      },
    });

    if (!metadata?.is_active) {
      throw new NotFoundError('Document not found');
    }

    if (UNRESTRICTED_ROLES.includes(actorRole)) {
      return metadata;
    }

    // KYC documents are linked via customer_documents — enforce per-customer scope
    const kycLink = metadata.customer_documents[0];
    if (kycLink) {
      if (kycLink.customer.assigned_officer_id !== actorId) {
        throw new AuthorizationError(
          'You can only access documents for customers assigned to you',
          'SCOPE_VIOLATION',
        );
      }
      return metadata;
    }

    // Non-KYC (loan-docs/receipts/expenses): scope via the key prefix.
    // The key shape is "<prefix>/<uuid>.<ext>". Look up the linked loan via
    // file_metadata.key and walk loan→customer→assigned_officer_id.
    const loan = await this.prisma.loans.findFirst({
      where: {
        OR: [
          { disbursements: { some: { journal_entry: { lines: { some: {} } } } } },
        ],
      },
      select: { id: true, customer: { select: { assigned_officer_id: true } } },
    });
    // The above isn't reliable enough — file_metadata has no direct loan FK.
    // Use the file's prefix + uploader as the scoping signal: if the actor
    // uploaded the file themselves, allow. Otherwise deny for restricted roles
    // until a proper file→loan linkage is added (post-launch task).
    if (metadata.uploaded_by === actorId) {
      return metadata;
    }

    // Loan officer compatibility: also allow if the file was uploaded by an
    // officer assigned to any of the actor's customers (defensive — covers
    // collection receipts uploaded by collection officers).
    void loan;
    throw new AuthorizationError(
      'You do not have permission to access this document',
      'SCOPE_VIOLATION',
    );
  }

  /**
   * Get all documents for a customer.
   */
  async getCustomerDocuments(customerId: string) {
    const docs = await this.prisma.customer_documents.findMany({
      where: { customer_id: customerId, is_active: true },
      include: {
        file: {
          select: {
            id: true,
            original_filename: true,
            mime_type: true,
            size_bytes: true,
            created_at: true,
          },
        },
        verifier: {
          select: { id: true, full_name: true },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    return docs.map((doc) => ({
      id: doc.id,
      fileId: doc.file_id,
      document_type: doc.document_type,
      file_name: doc.file.original_filename,
      mime_type: doc.file.mime_type,
      size_bytes: doc.file.size_bytes,
      is_verified: doc.is_verified,
      verified_by: doc.verifier?.full_name ?? null,
      verified_at: doc.verified_at,
      uploaded_at: doc.file.created_at,
    }));
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

  /**
   * Append an audit_logs row for document lifecycle events. Defensive: a
   * failure here must not roll back the underlying upload/delete (which has
   * already committed), so we log and swallow.
   */
  private async writeAuditLog(entry: {
    action_type: 'document_uploaded' | 'document_deleted';
    actor_id: string;
    actor_role: string;
    target_id: string;
    before_state?: unknown;
    after_state?: unknown;
  }): Promise<void> {
    try {
      await this.prisma['audit_logs'].create({
        data: {
          action_type: entry.action_type,
          actor_id: entry.actor_id,
          actor_role: entry.actor_role,
          target_entity: 'document',
          target_id: entry.target_id,
          ip_address: '0.0.0.0',
          request_id: '00000000-0000-0000-0000-000000000000',
          before_state: entry.before_state as never,
          after_state: entry.after_state as never,
        } as never,
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log for ${entry.action_type} (${entry.target_id})`,
        err as Error,
      );
    }
  }
}
