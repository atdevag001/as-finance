import {
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsUUID,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { JournalSourceType } from '@as-finance/shared';

// Reject inverted ranges so daybook/P&L don't silently return empty results.
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

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsDateString()
  @Validate(StartDateBeforeEndDateConstraint)
  endDate!: string;
}

export class AsOfDateQueryDto {
  @ApiPropertyOptional({ description: 'As-of date (ISO 8601). Defaults to today.' })
  @IsOptional()
  @IsDateString()
  asOfDate?: string;
}

export class JournalEntryQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by source type', enum: JournalSourceType })
  @IsOptional()
  @IsEnum(JournalSourceType)
  sourceType?: JournalSourceType;

  @ApiPropertyOptional({ description: 'Filter by source entity ID' })
  @IsOptional()
  @IsUUID()
  sourceId?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
