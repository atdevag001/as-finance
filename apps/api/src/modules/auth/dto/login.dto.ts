import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Username for authentication' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @ApiProperty({ description: 'User password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
