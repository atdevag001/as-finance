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
