import { IsUUID, IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CalculatePenaltyDto {
  @ApiProperty({ description: 'Loan ID to calculate penalty for' })
  @IsUUID()
  loanId!: string;

  @ApiProperty({ description: 'Installment ID to calculate penalty for' })
  @IsUUID()
  installmentId!: string;

  @ApiProperty({ description: 'Penalty period identifier (e.g., "2024-01", "2024-W05")' })
  @IsString()
  // Bounded to VarChar(20) DB column to surface a 400 instead of a 500 on overflow.
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_\-]+$/)
  penaltyPeriod!: string;

  @ApiProperty({ description: 'Calculation reference date (ISO 8601)', required: false })
  @IsOptional()
  @IsString()
  referenceDate?: string;
}
