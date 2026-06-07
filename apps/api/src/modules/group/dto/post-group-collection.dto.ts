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
  MinLength,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMode } from '@as-finance/shared';

// DTO-layer guard against future-dated collections; service re-checks in IST.
@ValidatorConstraint({ name: 'IsNotFutureDateString', async: false })
class IsNotFutureDateStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return false;
    const endOfTodayUtc = new Date();
    endOfTodayUtc.setUTCHours(23, 59, 59, 999);
    return parsed <= endOfTodayUtc.getTime();
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must not be a future date`;
  }
}

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
  @Validate(IsNotFutureDateStringConstraint)
  collectionDate!: string;

  @ApiProperty({ description: 'Payment mode', enum: PaymentMode })
  @IsEnum(PaymentMode, { message: 'paymentMode must be cash, bank_transfer, or online' })
  paymentMode!: PaymentMode;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
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
