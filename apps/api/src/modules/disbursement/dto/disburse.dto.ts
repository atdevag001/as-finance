import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
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
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  idempotencyKey!: string;
}
