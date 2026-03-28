import { IsOptional, IsString, IsInt, Min, Max, IsDateString, IsEnum, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { AuditAction } from '@as-finance/shared';

export class AuditLogQueryDto {
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

  @ApiPropertyOptional({ description: 'Filter by target entity type (e.g. customer, loan)' })
  @IsOptional()
  @IsString()
  targetEntity?: string;

  @ApiPropertyOptional({ description: 'Filter by target entity ID' })
  @IsOptional()
  @IsUUID()
  targetId?: string;

  @ApiPropertyOptional({ description: 'Filter by actor (user) ID' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'Filter by action type', enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  actionType?: string;

  @ApiPropertyOptional({ description: 'Start of date range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End of date range (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
