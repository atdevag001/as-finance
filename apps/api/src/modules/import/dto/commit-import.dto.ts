import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class CommitImportDto {
  @ApiProperty({ description: 'Import id returned by dry-run' })
  @IsUUID()
  importId!: string;

  @ApiPropertyOptional({ description: 'When true, abort on any invalid row instead of skipping' })
  @IsOptional()
  @IsBoolean()
  strict?: boolean;
}
