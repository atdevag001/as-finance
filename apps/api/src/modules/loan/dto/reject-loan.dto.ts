import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RejectLoanDto {
  @ApiProperty({ description: 'Reason for rejection (required)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason!: string;
}
