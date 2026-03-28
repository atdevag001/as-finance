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

  @ApiPropertyOptional({ description: 'User ID authorizing the rebate' })
  @IsOptional()
  @IsUUID()
  rebateAuthorizedBy?: string;
}
