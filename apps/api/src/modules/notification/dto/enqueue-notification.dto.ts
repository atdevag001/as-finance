import { IsEnum, IsString, IsObject, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class EnqueueNotificationDto {
  @ApiProperty({ description: 'Notification event type' })
  @IsString()
  event_type!: string;

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
