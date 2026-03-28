import { IsString, IsEnum, IsUUID, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Valid days of the week for group meeting day.
 * Matches the Prisma DayOfWeek enum.
 */
const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

/**
 * DTO for creating a new group.
 *
 * Requirements: 11.1
 */
export class CreateGroupDto {
  @ApiProperty({ description: 'Group name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Meeting day of the week', enum: DAYS_OF_WEEK })
  @IsEnum(DAYS_OF_WEEK, {
    message: 'meetingDay must be a valid day of the week (monday–sunday)',
  })
  meetingDay!: (typeof DAYS_OF_WEEK)[number];

  @ApiProperty({ description: 'Branch or area name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  branchArea!: string;

  @ApiProperty({ description: 'Customer ID of the group leader' })
  @IsUUID()
  leaderId!: string;
}
