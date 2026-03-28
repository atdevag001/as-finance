import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for adding a member to a group.
 *
 * Requirements: 11.2
 */
export class AddGroupMemberDto {
  @ApiProperty({ description: 'Customer ID of the member to add' })
  @IsUUID()
  customerId!: string;
}
