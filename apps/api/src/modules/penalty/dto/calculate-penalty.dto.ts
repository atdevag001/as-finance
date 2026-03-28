import { IsUUID, IsString, IsOptional } from 'class-validator';
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
  penaltyPeriod!: string;

  @ApiProperty({ description: 'Calculation reference date (ISO 8601)', required: false })
  @IsOptional()
  @IsString()
  referenceDate?: string;
}
