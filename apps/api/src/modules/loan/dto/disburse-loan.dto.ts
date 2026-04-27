import { IsEnum, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@as-finance/shared';

/**
 * DTO for disbursing a loan via the /loans/:id/disburse endpoint.
 *
 * If idempotencyKey is not provided, the server auto-generates one.
 */
export class DisburseLoanDto {
  @ApiProperty({ description: 'Disbursement mode', enum: ['cash', 'bank_transfer'] })
  @IsEnum(PaymentMode, { message: 'mode must be cash or bank_transfer' })
  mode!: PaymentMode;

  @ApiProperty({ description: 'Bank reference number (required for bank transfers)', required: false })
  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @ApiProperty({ description: 'Client-provided idempotency key (auto-generated if not provided)', required: false })
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
