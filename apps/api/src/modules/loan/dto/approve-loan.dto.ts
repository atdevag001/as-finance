import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveLoanDto {
  @ApiPropertyOptional({ description: 'Optional remarks for approval' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;
}
