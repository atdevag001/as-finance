import { IsString, IsUUID, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExecuteForeclosureDto {
  @ApiProperty({ description: 'Foreclosure quote ID to execute' })
  @IsUUID()
  foreclosureId!: string;

  @ApiPropertyOptional({ description: 'Updated rebate amount in paise (optional, overrides quote)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rebatePaise?: number;

  @ApiPropertyOptional({ description: 'Reason for rebate' })
  @IsOptional()
  @IsString()
  rebateReason?: string;

  /**
   * @deprecated Server-derived from authenticated user since 2026-06.
   * Client-supplied value is logged but not trusted.
   *
   * H13 — Historically the client could nominate any user as the rebate
   * authorizer, which broke the four-eyes audit trail. The service now
   * derives this from the JWT subject; this field is retained for backwards
   * compatibility (so existing clients don't 400) and for audit logging of
   * the *attempted* value.
   */
  @ApiPropertyOptional({ description: 'User ID authorizing the rebate' })
  @IsOptional()
  @IsUUID()
  rebateAuthorizedBy?: string;

  @ApiProperty({ description: 'Payment mode for settlement' })
  @IsString()
  paymentMode!: string;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  idempotencyKey!: string;
}
