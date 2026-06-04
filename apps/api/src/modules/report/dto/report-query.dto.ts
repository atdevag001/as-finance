import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LoanStatus } from '@as-finance/shared';

/**
 * H10c — replaces the freeform `Record<string,string>` query bag on
 * /reports/:reportType with a typed, validated DTO. The DTO is also used by
 * /reports/:reportType/export, so the `format` parameter is validated BEFORE
 * it is interpolated into the download filename (defence-in-depth against
 * header / path injection).
 */
export class ReportQueryDto {
  @ApiPropertyOptional({ description: 'ISO 8601 start date (inclusive)' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 end date (inclusive)' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 start date (legacy alias)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 end date (legacy alias)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'ISO 8601 as-of date' })
  @IsOptional()
  @IsDateString()
  asOfDate?: string;

  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Filter by loan ID' })
  @IsOptional()
  @IsUUID()
  loanId?: string;

  @ApiPropertyOptional({ description: 'Filter by officer (user) ID' })
  @IsOptional()
  @IsUUID()
  officerId?: string;

  @ApiPropertyOptional({ description: 'Filter by loan status', enum: LoanStatus })
  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @ApiPropertyOptional({ description: 'Max records to return', minimum: 1, maximum: 1000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  @ApiPropertyOptional({ description: 'Records to skip', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

/**
 * Supported export formats. Centralised so both the DTO and the service
 * dispatch on the same allowlist.
 */
export enum ReportExportFormat {
  PDF = 'pdf',
  XLSX = 'xlsx',
  CSV = 'csv',
}

export class ReportExportQueryDto extends ReportQueryDto {
  @ApiProperty({
    description: 'Export format (pdf, xlsx, or csv)',
    enum: ReportExportFormat,
  })
  @IsEnum(ReportExportFormat, {
    message: 'format must be one of: pdf, xlsx, csv',
  })
  format!: ReportExportFormat;
}
