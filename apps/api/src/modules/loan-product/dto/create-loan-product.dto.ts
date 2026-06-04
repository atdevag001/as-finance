import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsArray,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLoanProductDto {
  @ApiProperty({ description: 'Product name (unique)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Interest calculation type', enum: ['flat', 'reducing_balance'] })
  @IsEnum(['flat', 'reducing_balance'])
  interestType!: 'flat' | 'reducing_balance';

  @ApiProperty({ description: 'Annual interest rate in basis points (e.g. 1200 = 12%)' })
  @IsInt()
  @Min(1)
  annualRateBps!: number;

  @ApiProperty({ description: 'Minimum principal amount in paise' })
  @IsInt()
  @Min(1)
  minPrincipalPaise!: number;

  @ApiProperty({ description: 'Maximum principal amount in paise' })
  @IsInt()
  @Min(1)
  maxPrincipalPaise!: number;

  @ApiProperty({ description: 'Minimum tenure in months' })
  @IsInt()
  @Min(1)
  minTenureMonths!: number;

  @ApiProperty({ description: 'Maximum tenure in months' })
  @IsInt()
  @Min(1)
  maxTenureMonths!: number;

  @ApiProperty({ description: 'Repayment frequency', enum: ['daily', 'weekly', 'monthly'] })
  @IsEnum(['daily', 'weekly', 'monthly'])
  repaymentFrequency!: 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional({ description: 'Processing fee type', enum: ['fixed', 'percentage'] })
  @IsOptional()
  @IsEnum(['fixed', 'percentage'])
  processingFeeType?: 'fixed' | 'percentage';

  @ApiPropertyOptional({ description: 'Processing fee value (paise if fixed, bps if percentage)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  processingFeeValue?: number;

  @ApiPropertyOptional({ description: 'Penalty grace period in days', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  penaltyGraceDays?: number;

  @ApiPropertyOptional({ description: 'Penalty type', enum: ['flat_per_period', 'percentage_of_overdue'] })
  @IsOptional()
  @IsEnum(['flat_per_period', 'percentage_of_overdue'])
  penaltyType?: 'flat_per_period' | 'percentage_of_overdue';

  @ApiPropertyOptional({ description: 'Penalty value (paise if flat, bps if percentage)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  penaltyValue?: number;

  @ApiPropertyOptional({ description: 'Penalty frequency', enum: ['daily', 'weekly', 'monthly'] })
  @IsOptional()
  @IsEnum(['daily', 'weekly', 'monthly'])
  penaltyFrequency?: 'daily' | 'weekly' | 'monthly';

  @ApiPropertyOptional({ description: 'Maximum concurrent loans per customer for this product', default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  maxConcurrentLoans?: number;

  @ApiPropertyOptional({
    description: 'Allocation order for payments',
    default: ['penalty', 'interest', 'principal'],
    example: ['penalty', 'interest', 'principal'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allocationOrder?: string[];
}
