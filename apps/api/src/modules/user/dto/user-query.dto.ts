import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@as-finance/shared';

/**
 * DTO for GET /users.
 *
 * H10b — validates pagination + filter inputs so callers cannot smuggle
 * arbitrary strings, negative offsets, or unbounded page sizes into the user
 * listing endpoint.
 */
export class UserQueryDto {
  @ApiPropertyOptional({ description: 'Number of records to skip', minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ description: 'Number of records to take', minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiPropertyOptional({ description: 'Filter by user role', enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Free-text search (username / full name / mobile)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
