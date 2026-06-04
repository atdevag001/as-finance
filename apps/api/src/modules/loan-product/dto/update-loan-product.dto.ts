import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateLoanProductDto {
  @ApiPropertyOptional({ description: 'Interest calculation type', enum: ['flat', 'reducing_balance'] })
  @IsOptional()
  @IsEnum(['flat', 'reducing_balance'])
  interestType?: 'flat' | 'reducing_balance';

  @ApiPropertyOptional({ description: 'Annual interest rate in basis points' })
  @IsOptional()
  @IsInt()
  @Min(1)
  annualRateBps?: number;

  @ApiPropertyOptional({ description: 'Minimum principal amount in paise' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minPrincipalPaise?: number;

  @ApiPropertyOptional({ description: 'Maximum principal amount in paise' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPrincipalPaise?: number;

  @ApiPropertyOptional({ description: 'Minimum tenure in months' })
  @IsOptional()
  @IsInt()
  @Min(1)
  minTenureMonths?: number;

  @ApiPropertyOptional({ description: 'Maximum tenure in months' })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxTenureMonths?: number;

  @ApiPropertyOptional({ description: 'Repayment frequency', enum: ['daily', 'weekly', 'monthly'] })
  @IsOptional()
  @IsEnum(['daily', 'weekly', 'monthly'])
  repaymentFrequency?: 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional({ description: 'Processing fee type', enum: ['fixed', 'percentage'] })
  @IsOptional()
  @IsEnum(['fixed', 'percentage'])
  processingFeeType?: 'fixed' | 'percentage' | null;

  @ApiPropertyOptional({ description: 'Processing fee value (paise if fixed, bps if percentage)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  processingFeeValue?: number | null;

  @ApiPropertyOptional({ description: 'Penalty grace period in days' })
  @IsOptional()
  @IsInt()
  @Min(0)
  penaltyGraceDays?: number;

  @ApiPropertyOptional({ description: 'Penalty type', enum: ['flat_per_period', 'percentage_of_overdue'] })
  @IsOptional()
  @IsEnum(['flat_per_period', 'percentage_of_overdue'])
  penaltyType?: 'flat_per_period' | 'percentage_of_overdue' | null;

  @ApiPropertyOptional({ description: 'Penalty value (paise if flat, bps if percentage)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  penaltyValue?: number | null;

  @ApiPropertyOptional({ description: 'Penalty frequency', enum: ['daily', 'weekly', 'monthly'] })
  @IsOptional()
  @IsEnum(['daily', 'weekly', 'monthly'])
  penaltyFrequency?: 'daily' | 'weekly' | 'monthly' | null;

  @ApiPropertyOptional({ description: 'Maximum concurrent loans per customer' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConcurrentLoans?: number;

  @ApiPropertyOptional({ description: 'Allocation order for payments' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allocationOrder?: string[];
}
