import { IsOptional, IsDateString, IsInt, Min, Max, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Query DTO for listing expenses with filters and pagination.
 */
export class ExpenseQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by expense category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * Query DTO for listing handovers with filters and pagination.
 */
export class HandoverQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by collection officer ID' })
  @IsOptional()
  @IsUUID()
  officerId?: string;

  @ApiPropertyOptional({ description: 'Filter by verification status' })
  @IsOptional()
  @IsString()
  verificationStatus?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * Query DTO for daily cash summary.
 */
export class DailySummaryQueryDto {
  @ApiPropertyOptional({ description: 'Date for daily summary (ISO 8601). Defaults to today.' })
  @IsOptional()
  @IsDateString()
  date?: string;
}
