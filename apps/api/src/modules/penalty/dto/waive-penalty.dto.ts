import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WaivePenaltyDto {
  @ApiProperty({ description: 'Mandatory reason for waiving the penalty', maxLength: 500 })
  @IsString()
  @MinLength(5, { message: 'Waiver reason must be at least 5 characters' })
  // Cap audit/log payload size — DB column is unbounded TEXT.
  @MaxLength(500, { message: 'Waiver reason must be at most 500 characters' })
  reason!: string;

  @ApiProperty({ description: 'User ID of the waiver approver (must differ from requester)' })
  @IsUUID()
  approverId!: string;
}
