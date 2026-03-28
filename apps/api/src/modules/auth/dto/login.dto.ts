import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Username for authentication' })
  @IsString()
  @IsNotEmpty()
  username!: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  @IsNotEmpty()
  password!: string;
}
