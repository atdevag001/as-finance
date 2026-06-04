import { IsOptional, IsString, IsInt, Min, Max, IsUUID, Matches, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * M12 — loan status filter is now constrained to the canonical LoanStatus
 * enum values (mirrors `LoanStatus` in @as-finance/shared). Kept as a local
 * const array so class-validator's @IsEnum can use it as an allowlist
 * without pulling the full enum into the query DTO.
 */
export const LOAN_STATUS_FILTER_VALUES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'disbursed',
  'active',
  'overdue',
  'defaulted',
  'foreclosed',
  'closed',
] as const;

export type LoanStatusFilter = (typeof LOAN_STATUS_FILTER_VALUES)[number];

export class LoanQueryDto {
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

  @ApiPropertyOptional({
    description: 'Filter by loan status',
    enum: LOAN_STATUS_FILTER_VALUES,
  })
  @IsOptional()
  @IsEnum(LOAN_STATUS_FILTER_VALUES, {
    message: `status must be one of: ${LOAN_STATUS_FILTER_VALUES.join(', ')}`,
  })
  status?: LoanStatusFilter;

  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Search by loan number' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by customer Aadhaar last 4 digits' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'aadhaarLastFour must be exactly 4 digits' })
  aadhaarLastFour?: string;
}
