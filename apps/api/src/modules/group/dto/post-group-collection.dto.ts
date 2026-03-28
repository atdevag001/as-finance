import {
  IsInt,
  IsPositive,
  IsString,
  IsDateString,
  IsEnum,
  IsArray,
  ValidateNested,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMode } from '@as-finance/shared';

/**
 * Individual member breakdown within a group collection.
 */
export class MemberBreakdownItem {
  @ApiProperty({ description: 'Loan ID for this member' })
  @IsUUID()
  loanId!: string;

  @ApiProperty({ description: 'Amount in paise for this member (integer, positive)' })
  @IsInt()
  @IsPositive()
  amountPaise!: number;
}

/**
 * DTO for posting a group collection.
 *
 * Requirements: 11.4, 11.5, 11.7
 */
export class PostGroupCollectionDto {
  @ApiProperty({ description: 'Total collection amount in paise (integer, positive)' })
  @IsInt()
  @IsPositive()
  totalAmountPaise!: number;

  @ApiProperty({ description: 'Collection date (ISO 8601)' })
  @IsDateString()
  collectionDate!: string;

  @ApiProperty({ description: 'Payment mode', enum: PaymentMode })
  @IsEnum(PaymentMode, { message: 'paymentMode must be cash, bank_transfer, or online' })
  paymentMode!: PaymentMode;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  idempotencyKey!: string;

  @ApiProperty({
    description: 'Member-wise breakdown of collection amounts',
    type: [MemberBreakdownItem],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MemberBreakdownItem)
  memberBreakdown!: MemberBreakdownItem[];
}
