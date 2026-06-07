import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for reversing a collection.
 *
 * Requirements: 7.1
 */
export class ReverseCollectionDto {
  @ApiProperty({ description: 'ID of the original collection to reverse' })
  @IsUUID()
  collectionId!: string;

  @ApiProperty({ description: 'Mandatory reason for the reversal' })
  @IsString()
  @MinLength(1, { message: 'Reversal reason is required' })
  @MaxLength(1000, { message: 'Reversal reason must be 1000 characters or less' })
  reason!: string;

  @ApiProperty({ description: 'Idempotency key for duplicate prevention' })
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;
}
