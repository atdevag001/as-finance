import {
  IsOptional,
  IsString,
  IsEnum,
  IsEmail,
  IsBoolean,
  IsInt,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@as-finance/shared';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Full display name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ description: 'Email address (null clears the field)', nullable: true })
  @IsOptional()
  // Allow explicit null to clear the stored email; only validate format when non-null.
  @ValidateIf((o) => o.email !== null)
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @ApiPropertyOptional({ description: 'Mobile number (Indian format: 10 digits starting with 6-9)' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  // Mirror frontend mobileSchema so direct API callers (Swagger/curl) cannot bypass format checks.
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  mobile?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'New role' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Active status' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Expected version for optimistic concurrency control' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
