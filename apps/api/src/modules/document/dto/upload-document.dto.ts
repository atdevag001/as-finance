import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Valid upload prefixes (document categories) */
export const VALID_PREFIXES = ['kyc', 'loan-docs', 'receipts', 'expenses'] as const;
export type DocumentPrefix = (typeof VALID_PREFIXES)[number];

/** Valid document types for KYC */
export const VALID_DOC_TYPES = [
  'aadhaar_front',
  'aadhaar_back',
  'pan',
  'photo',
  'address_proof',
  'other',
] as const;
export type DocumentType = (typeof VALID_DOC_TYPES)[number];

/**
 * DTO for document upload. Declared as a class so the global ValidationPipe
 * (whitelist + forbidNonWhitelisted + transform) can inspect decorators at
 * runtime — an interface erases at compile time and would silently bypass
 * validation, letting malformed customerId values reach Prisma as a 500.
 */
export class UploadDocumentDto {
  @ApiProperty({ enum: VALID_PREFIXES, description: 'Document category' })
  @IsIn(VALID_PREFIXES as unknown as string[])
  prefix!: DocumentPrefix;

  @ApiPropertyOptional({ description: 'Customer UUID (required for KYC uploads)' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: VALID_DOC_TYPES, description: 'KYC document type' })
  @IsOptional()
  @IsIn(VALID_DOC_TYPES as unknown as string[])
  documentType?: DocumentType;
}
