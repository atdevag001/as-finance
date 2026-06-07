import {
  IsEnum,
  IsOptional,
  IsString,
  IsDateString,
  IsNotEmpty,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@as-finance/shared';

/**
 * DTO for disbursing a loan via the /loans/:id/disburse endpoint.
 *
 * If idempotencyKey is not provided, the server falls back to a deterministic
 * per-loan key (`disburse-{loanId}`) so retries return the cached success body
 * instead of a 409 ALREADY_DISBURSED.
 */
export class DisburseLoanDto {
  @ApiProperty({ description: 'Disbursement mode', enum: ['cash', 'bank_transfer'] })
  @IsEnum(PaymentMode, { message: 'mode must be cash or bank_transfer' })
  mode!: PaymentMode;

  @ApiProperty({ description: 'Bank reference number (required for bank transfers)', required: false })
  // Enforce reference for bank transfers so the audit trail can reconcile against bank statements.
  @ValidateIf((o) => o.mode === PaymentMode.BANK_TRANSFER)
  @IsNotEmpty({ message: 'referenceNumber is required for bank_transfer' })
  @IsString()
  @MaxLength(100)
  referenceNumber?: string;

  @ApiProperty({ description: 'Client-provided idempotency key (defaults to deterministic `disburse-{loanId}` so retries return the cached result)', required: false })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Override first EMI due date (ISO date string). Must be after disbursement date. If provided, regenerates the schedule.',
    example: '2026-05-27',
  })
  @IsOptional()
  @IsDateString()
  firstEmiDate?: string;
}
