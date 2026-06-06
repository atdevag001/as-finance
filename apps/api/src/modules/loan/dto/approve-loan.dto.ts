import {
  IsOptional,
  IsString,
  MaxLength,
  IsDateString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

@ValidatorConstraint({ name: 'IsFutureDateString', async: false })
class IsFutureDateStringConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'string') return false;
    const parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return false;
    // Compare against today's UTC midnight so the DTO-layer guard rejects past
    // dates regardless of server timezone (LoanService re-checks in IST).
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    return parsed > today.getTime();
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a future date`;
  }
}

export class ApproveLoanDto {
  @ApiPropertyOptional({ description: 'Optional remarks for approval' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @ApiPropertyOptional({
    description: 'First EMI due date (ISO date string). If not provided, defaults to approval date + 1 frequency period. Must be a future date.',
    example: '2026-05-27',
  })
  @IsOptional()
  @IsDateString()
  @Validate(IsFutureDateStringConstraint)
  firstEmiDate?: string;
}
