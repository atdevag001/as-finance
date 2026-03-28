import { IsInt, Min, IsDateString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for recording a cash handover.
 * Records total cash handed over from collection officer to receiving officer.
 */
export class CreateHandoverDto {
  @ApiProperty({ description: 'Total cash amount in paise (integer, positive)' })
  @IsInt()
  @Min(1)
  totalAmountPaise!: number;

  @ApiProperty({ description: 'Receiving officer user ID' })
  @IsUUID()
  receivingOfficerId!: string;

  @ApiProperty({ description: 'Handover date (ISO 8601)' })
  @IsDateString()
  handoverDate!: string;
}
