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
   * @deprecated Server-derived from the authenticated actor (JWT subject)
   * whenever a rebate is applied — the client-supplied value is ignored.
   *
   * H13 — Historically the client could nominate any user as the rebate
   * authorizer, which broke the four-eyes audit trail. The service now
   * always derives the authorizer from req.user.sub; the field is retained
   * only for backwards compatibility so existing clients don't 400.
   */
  @ApiPropertyOptional({ description: 'Deprecated — server-derived from JWT subject; client value ignored' })
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
