import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: 'Username for authentication' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @ApiProperty({
    description: 'User password (max 72 bytes — bcrypt truncation limit)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
