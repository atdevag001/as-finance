import { IsString, IsUUID, IsOptional, IsInt, Min, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateForeclosureQuoteDto {
  @ApiProperty({ description: 'Loan ID to generate foreclosure quote for' })
  @IsUUID()
  loanId!: string;

  @ApiPropertyOptional({ description: 'Rebate amount in paise (optional)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  rebatePaise?: number;

  // Bound the rebate reason: prevents unbounded TEXT writes and ensures the
  // audit log gets a meaningful justification (matches the 10-char min in UI).
  @ApiPropertyOptional({ description: 'Reason for rebate (10-500 chars)' })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  rebateReason?: string;

  /**
   * @deprecated Server-derived from the authenticated actor (JWT subject)
   * whenever a rebate is applied — the client-supplied value is ignored.
   * Retained for backwards compatibility so existing clients don't 400.
   */
  @ApiPropertyOptional({ description: 'Deprecated — server-derived from JWT subject; client value ignored' })
  @IsOptional()
  @IsUUID()
  rebateAuthorizedBy?: string;
}
