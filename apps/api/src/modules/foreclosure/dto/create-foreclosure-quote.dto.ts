import { IsString, IsUUID, IsOptional, IsInt, Min } from 'class-validator';
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

  @ApiPropertyOptional({ description: 'Reason for rebate' })
  @IsOptional()
  @IsString()
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
