import { IsOptional, IsString, IsInt, Min, Max, IsDateString, IsEnum, IsUUID } from 'class-validator';
// Max range covers all real-world UTC offsets (UTC-12 to UTC+14, plus a margin).
const MAX_TZ_OFFSET_MINUTES = 14 * 60;
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

  // Matches Date.prototype.getTimezoneOffset() semantics (minutes west of UTC, IST = -330).
  @ApiPropertyOptional({ description: 'Client timezone offset in minutes, matching Date#getTimezoneOffset()' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-MAX_TZ_OFFSET_MINUTES)
  @Max(MAX_TZ_OFFSET_MINUTES)
  tzOffsetMinutes?: number;
}
