import { IsDateString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for regenerating a loan's EMI schedule with a new first EMI date.
 *
 * Constraints:
 * - Can only be used before first payment is collected
 * - First EMI date must be in the future
 * - If loan is disbursed, first EMI date must be after disbursement date
 */
export class RegenerateScheduleDto {
  @ApiProperty({
    description: 'New first EMI due date (ISO date string). Must be in the future and after disbursement date if disbursed.',
    example: '2026-05-27',
  })
  @IsNotEmpty()
  @IsDateString()
  firstEmiDate!: string;
}
