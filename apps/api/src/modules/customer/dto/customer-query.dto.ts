import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * M12 — customer query filters are now constrained to canonical enums so the
 * controller cannot accept arbitrary status / risk strings that bypass
 * downstream service logic.
 */
export const CUSTOMER_STATUS_FILTER_VALUES = [
  'active',
  'blacklisted',
  'inactive',
] as const;

export type CustomerStatusFilter =
  (typeof CUSTOMER_STATUS_FILTER_VALUES)[number];

export const CUSTOMER_RISK_LEVEL_VALUES = ['low', 'medium', 'high'] as const;

export type CustomerRiskLevel = (typeof CUSTOMER_RISK_LEVEL_VALUES)[number];

export class CustomerQueryDto {
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
    description: 'Filter by status',
    enum: CUSTOMER_STATUS_FILTER_VALUES,
  })
  @IsOptional()
  @IsEnum(CUSTOMER_STATUS_FILTER_VALUES, {
    message: `status must be one of: ${CUSTOMER_STATUS_FILTER_VALUES.join(', ')}`,
  })
  status?: CustomerStatusFilter;

  @ApiPropertyOptional({ description: 'Search by name, mobile, or Aadhaar last 4' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by risk level',
    enum: CUSTOMER_RISK_LEVEL_VALUES,
  })
  @IsOptional()
  @IsEnum(CUSTOMER_RISK_LEVEL_VALUES, {
    message: `riskLevel must be one of: ${CUSTOMER_RISK_LEVEL_VALUES.join(', ')}`,
  })
  riskLevel?: CustomerRiskLevel;
}
