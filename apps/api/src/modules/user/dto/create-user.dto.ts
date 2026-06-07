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
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(100)
  // Mirror frontend zod schema so Swagger/direct API callers cannot create unidentifiable usernames (e.g. whitespace or symbols).
  @Matches(/^[A-Za-z0-9_.\-]+$/, {
    message:
      'Username may contain only letters, digits, dot, underscore, hyphen',
  })
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

  @ApiProperty({ description: 'Mobile number (Indian format: 10 digits starting with 6-9)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  // Mirror frontend mobileSchema so direct API callers (Swagger/curl) cannot bypass format checks.
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  mobile!: string;

  @ApiProperty({ enum: UserRole, description: 'User role' })
  @IsEnum(UserRole)
  role!: UserRole;
}
