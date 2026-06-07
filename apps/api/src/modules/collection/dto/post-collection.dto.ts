import {
  IsEnum,
  IsInt,
  IsPositive,
  IsString,
  IsUUID,
  IsDateString,
  Matches,
  MinLength,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PaymentMode } from '@as-finance/shared';

// DTO-layer guard against future-dated payments; service re-checks in IST.
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
  @Validate(IsNotFutureDateStringConstraint)
  paymentDate!: string;

  @ApiProperty({ description: 'Payment mode', enum: PaymentMode })
  @IsEnum(PaymentMode, { message: 'paymentMode must be cash, bank_transfer, or online' })
  paymentMode!: PaymentMode;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  // Restrict charset so whitespace-only / control-char keys cannot pass length check.
  @Matches(/^[A-Za-z0-9_:.-]+$/, {
    message: 'idempotencyKey may only contain alphanumerics, _, :, ., -',
  })
  idempotencyKey!: string;
}
