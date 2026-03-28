import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsOptional,
  IsEmail,
  MinLength,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@as-finance/shared';

export class CreateUserDto {
  @ApiProperty({ description: 'Unique login username' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  username!: string;

  @ApiProperty({
    description:
      'Password (min 8 chars, at least one uppercase, one lowercase, one digit)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/[A-Z]/, {
    message: 'Password must contain at least one uppercase letter',
  })
  @Matches(/[a-z]/, {
    message: 'Password must contain at least one lowercase letter',
  })
  @Matches(/\d/, { message: 'Password must contain at least one digit' })
  password!: string;

  @ApiProperty({ description: 'Full display name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiProperty({ description: 'Mobile number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  mobile!: string;

  @ApiProperty({ enum: UserRole, description: 'User role' })
  @IsEnum(UserRole)
  role!: UserRole;
}
