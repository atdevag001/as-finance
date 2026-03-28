import { IsEnum, IsInt, IsPositive, IsString, IsUUID, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMode } from '@as-finance/shared';

/**
 * DTO for posting a collection (payment) against a loan.
 *
 * Requirements: 6.1, 6.2, 6.4
 */
export class PostCollectionDto {
  @ApiProperty({ description: 'Loan ID to collect against' })
  @IsUUID()
  loanId!: string;

  @ApiProperty({ description: 'Collection amount in paise (integer, positive)' })
  @IsInt()
  @IsPositive()
  amountPaise!: number;

  @ApiProperty({ description: 'Payment date (ISO 8601, e.g. 2024-06-15)' })
  @IsDateString()
  paymentDate!: string;

  @ApiProperty({ description: 'Payment mode', enum: PaymentMode })
  @IsEnum(PaymentMode, { message: 'paymentMode must be cash, bank_transfer, or online' })
  paymentMode!: PaymentMode;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  idempotencyKey!: string;
}
