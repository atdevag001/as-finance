import { IsEnum, IsOptional, IsInt, IsString, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for verifying a cash handover.
 * Allows marking as verified or flagging discrepancies.
 */
export class VerifyHandoverDto {
  @ApiProperty({
    description: 'Verification status',
    enum: ['verified', 'discrepancy'],
  })
  @IsEnum(['verified', 'discrepancy'])
  verificationStatus!: 'verified' | 'discrepancy';

  @ApiPropertyOptional({ description: 'Discrepancy amount in paise (required if discrepancy)' })
  @IsOptional()
  @IsInt()
  // Negative or zero discrepancies are semantically meaningless and corrupt aggregations.
  @Min(1)
  discrepancyAmountPaise?: number;

  @ApiPropertyOptional({ description: 'Notes about the discrepancy' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  discrepancyNotes?: string;
}
