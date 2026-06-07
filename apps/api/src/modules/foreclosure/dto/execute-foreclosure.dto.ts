import { IsString, IsUUID, IsOptional, IsInt, Min, IsEnum, MinLength, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode } from '@as-finance/shared';

export class ExecuteForeclosureDto {
  @ApiProperty({ description: 'Foreclosure quote ID to execute' })
  @IsUUID()
  foreclosureId!: string;

  @ApiPropertyOptional({ description: 'Updated rebate amount in paise (optional, overrides quote)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rebatePaise?: number;

  // M-rebate-audit: when a rebate is applied the reason is mandatory so the
  // financial waiver leaves a non-empty audit trail (no silent "no reason").
  // Bounds match the UI (min 10) and cap the TEXT column at 500 chars.
  @ApiPropertyOptional({ description: 'Reason for rebate (required when rebatePaise > 0, 10-500 chars)' })
  @ValidateIf((o) => (o.rebatePaise ?? 0) > 0)
  @IsString()
  @MinLength(10)
  @MaxLength(500)
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

  // M-paymentmode-enum: constrain to the Prisma PaymentMode enum so invalid
  // values 400 at the boundary instead of triggering an opaque Prisma 500.
  @ApiProperty({ description: 'Payment mode for settlement', enum: PaymentMode })
  @IsEnum(PaymentMode, { message: 'paymentMode must be cash, bank_transfer, or online' })
  paymentMode!: PaymentMode;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  idempotencyKey!: string;
}
