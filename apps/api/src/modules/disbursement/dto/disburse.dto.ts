import { IsEnum, IsOptional, IsString, IsUUID, IsDateString } from 'class-validator';
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
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  idempotencyKey!: string;

  @ApiPropertyOptional({
    description: 'Override first EMI due date (ISO date string). Must be after disbursement date. If provided, regenerates the schedule.',
    example: '2026-05-27',
  })
  @IsOptional()
  @IsDateString()
  firstEmiDate?: string;
}
