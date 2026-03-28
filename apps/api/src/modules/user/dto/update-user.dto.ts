import {
  IsOptional,
  IsString,
  IsEnum,
  IsEmail,
  IsBoolean,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@as-finance/shared';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Full display name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ description: 'Email address' })
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional({ description: 'Mobile number' })
  @IsOptional()
  @IsString()
  @MaxLength(15)
  mobile?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'New role' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
