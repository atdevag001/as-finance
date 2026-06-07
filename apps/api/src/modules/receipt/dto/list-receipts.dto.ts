import { IsOptional, IsInt, Min, Max, IsUUID, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Query DTO for listing receipts with filters and pagination.
 *
 * Bounds prevent unbounded `take` from exhausting DB/memory and reject
 * non-numeric values before they reach Prisma.
 */
export class ListReceiptsDto {
  @ApiPropertyOptional({ description: 'Filter by loan ID' })
  @IsOptional()
  @IsUUID()
  loanId?: string;

  @ApiPropertyOptional({ description: 'Filter by customer ID' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'Exact match on receipt number (e.g. RCP-2026-00042)' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  receiptNumber?: string;

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
}
