import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsNotEmpty,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@as-finance/shared';

/**
 * DTO for disbursement request.
 *
 * Requirements: 5.1, 5.2, 5.5
 */
export class DisburseDto {
  @ApiProperty({ description: 'Loan ID to disburse' })
  @IsUUID()
  loanId!: string;

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

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  // Enforce length bounds so empty strings cannot collide across operations and 256+ chars fail before the DB VarChar(255) bound.
  @IsString()
  @IsNotEmpty()
  @Length(8, 255)
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Override first EMI due date as YYYY-MM-DD. Must be after disbursement date. If provided, regenerates the schedule.',
    example: '2026-05-27',
  })
  @IsOptional()
  // parseDateIST splits on '-' and only handles YYYY-MM-DD; reject ISO datetimes up-front with a clean 400.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'firstEmiDate must be YYYY-MM-DD' })
  firstEmiDate?: string;
}
