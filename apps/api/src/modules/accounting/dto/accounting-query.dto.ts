import { IsOptional, IsDateString, IsInt, Min, Max, IsEnum, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { JournalSourceType } from '@as-finance/shared';

export class DateRangeQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsDateString()
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
