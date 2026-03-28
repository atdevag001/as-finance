import { IsString, IsUUID, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class WaivePenaltyDto {
  @ApiProperty({ description: 'Mandatory reason for waiving the penalty' })
  @IsString()
  @MinLength(5, { message: 'Waiver reason must be at least 5 characters' })
  reason!: string;

  @ApiProperty({ description: 'User ID of the waiver approver (must differ from requester)' })
  @IsUUID()
  approverId!: string;
}
