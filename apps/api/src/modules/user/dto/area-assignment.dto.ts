import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for POST /users/:id/area-assignments.
 *
 * H10a — replaces a raw @Body('areaName') string with a validated DTO so that
 * the assignment endpoint rejects oversized payloads, non-string types, and
 * characters that fall outside the allowed identifier set (alphanumerics,
 * spaces, commas, dots, hyphens).
 */
export class AddAreaAssignmentDto {
  @ApiProperty({
    description:
      'Area / route name to assign. Allowed characters: letters, digits, spaces, commas, dots, hyphens (max 100 chars).',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z0-9 ,.\-]+$/, {
    message:
      'areaName may only contain letters, digits, spaces, commas, dots, and hyphens',
  })
  areaName!: string;
}
