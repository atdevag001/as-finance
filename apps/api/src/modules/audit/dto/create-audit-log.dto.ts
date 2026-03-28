import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { AuditAction } from '@as-finance/shared';

/**
 * Internal DTO for creating audit log entries.
 * Used by services within transactions — not exposed as an API endpoint.
 */
export class CreateAuditLogDto {
  @IsEnum(AuditAction)
  action_type!: string;

  @IsUUID()
  actor_id!: string;

  @IsString()
  actor_role!: string;

  @IsString()
  target_entity!: string;

  @IsUUID()
  target_id!: string;

  @IsOptional()
  @IsString()
  ip_address?: string;

  @IsOptional()
  @IsString()
  request_id?: string;

  @IsOptional()
  before_state?: unknown;

  @IsOptional()
  after_state?: unknown;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsUUID()
  approval_id?: string;
}
