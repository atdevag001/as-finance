import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BlacklistDto {
  @ApiProperty({ description: 'Reason for blacklisting the customer' })
  @IsString()
  @IsNotEmpty({ message: 'Blacklist reason is required' })
  reason!: string;
}

export class ReinstateDto {
  @ApiProperty({ description: 'Reason for reinstating the customer' })
  @IsString()
  @IsNotEmpty({ message: 'Reinstatement reason is required' })
  reason!: string;
}
