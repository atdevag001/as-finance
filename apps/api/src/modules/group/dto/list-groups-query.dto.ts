import { IsOptional, IsString, IsInt, Min, Max, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Constrains group status filter to canonical Prisma values so the controller
 * cannot accept arbitrary strings that bypass downstream logic.
 */
export const GROUP_STATUS_FILTER_VALUES = [
  'active',
  'inactive',
  'dissolved',
] as const;

export type GroupStatusFilter = (typeof GROUP_STATUS_FILTER_VALUES)[number];

export class ListGroupsQueryDto {
  @ApiPropertyOptional({ description: 'Number of records to skip' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @ApiPropertyOptional({ description: 'Number of records to take (max 100)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: GROUP_STATUS_FILTER_VALUES,
  })
  @IsOptional()
  @IsEnum(GROUP_STATUS_FILTER_VALUES, {
    message: `status must be one of: ${GROUP_STATUS_FILTER_VALUES.join(', ')}`,
  })
  status?: GroupStatusFilter;

  @ApiPropertyOptional({ description: 'Filter by branch or area' })
  @IsOptional()
  @IsString()
  branchArea?: string;
}
