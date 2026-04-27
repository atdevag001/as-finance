import { IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveLoanDto {
  @ApiPropertyOptional({ description: 'Optional remarks for approval' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @ApiPropertyOptional({
    description: 'First EMI due date (ISO date string). If not provided, defaults to approval date + 1 frequency period.',
    example: '2026-05-27',
  })
  @IsOptional()
  @IsDateString()
  firstEmiDate?: string;
}
