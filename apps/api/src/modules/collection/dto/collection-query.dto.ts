import {
  IsOptional,
  IsString,
  IsInt,
  IsUUID,
  Min,
  Max,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

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
  endDate?: string;

  @ApiPropertyOptional({ description: 'Search by loan number (substring)' })
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
