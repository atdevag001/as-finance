import { IsOptional, IsInt, IsEnum, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { NotificationEvent, OutboxStatus } from '@as-finance/shared';

export class NotificationQueryDto {
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

  // Enum-validate filters so invalid values surface as 400s instead of silently returning empty result sets.
  @ApiPropertyOptional({ enum: OutboxStatus, description: 'Filter by outbox status' })
  @IsOptional()
  @IsEnum(OutboxStatus)
  status?: OutboxStatus;

  @ApiPropertyOptional({ enum: NotificationEvent, description: 'Filter by notification event type' })
  @IsOptional()
  @IsEnum(NotificationEvent)
  eventType?: NotificationEvent;
}
