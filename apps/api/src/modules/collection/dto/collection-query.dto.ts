import {
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Min,
  Max,
  Matches,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// Reject inverted ranges so the repository doesn't silently return an empty list.
@ValidatorConstraint({ name: 'startDateBeforeEndDate', async: false })
class StartDateBeforeEndDateConstraint implements ValidatorConstraintInterface {
  validate(endDate: unknown, args: ValidationArguments) {
    const { startDate } = args.object as { startDate?: string };
    if (!startDate || typeof endDate !== 'string' || !endDate) return true;
    return startDate <= endDate;
  }
  defaultMessage() {
    return 'endDate must be on or after startDate';
  }
}

export class CollectionQueryDto {
  @ApiPropertyOptional({ description: 'Filter by loan UUID' })
  @IsOptional()
  @IsUUID()
  loanId?: string;

  @ApiPropertyOptional({ description: 'Number of records to skip' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ description: 'Number of records to take (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate must be YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate must be YYYY-MM-DD' })
  @Validate(StartDateBeforeEndDateConstraint)
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Search by loan number (case-insensitive prefix match, e.g. "LN-2024"). ' +
      'Prefix-only so queries can use the unique btree index on loans.loan_number.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  loanNumber?: string;

  @ApiPropertyOptional({ description: 'Filter by customer Aadhaar last 4 digits' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'aadhaarLastFour must be exactly 4 digits' })
  aadhaarLastFour?: string;
}
