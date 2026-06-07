import { IsString, IsObject, IsOptional, IsInt, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NotificationEvent } from '@as-finance/shared';

export class EnqueueNotificationDto {
  // Constrain to the Prisma NotificationEvent enum; arbitrary strings would be rejected by Postgres or silently fall through to the fallback template.
  @ApiProperty({ enum: NotificationEvent, description: 'Notification event type' })
  @IsEnum(NotificationEvent)
  event_type!: NotificationEvent;

  @ApiProperty({ description: 'Recipient mobile number' })
  @IsString()
  recipient_mobile!: string;

  @ApiProperty({ description: 'Template variable substitutions' })
  @IsObject()
  variables!: Record<string, string>;

  @ApiProperty({ description: 'Source entity type (e.g. disbursement, collection)' })
  @IsString()
  source_type!: string;

  @ApiProperty({ description: 'Source entity ID' })
  @IsString()
  source_id!: string;

  @ApiPropertyOptional({ description: 'Language for template lookup', default: 'en' })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({ description: 'Maximum retry attempts', default: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_retries?: number;
}
