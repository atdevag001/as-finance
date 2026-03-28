import {
  IsNotEmpty,
  IsString,
  IsOptional,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFamilyMemberDto {
  @ApiProperty({ description: 'Family member name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({
    description: 'Relationship to customer',
    enum: ['father', 'mother', 'spouse', 'sibling', 'child', 'other'],
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  relationship!: string;

  @ApiPropertyOptional({ description: 'Contact number' })
  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  contactNumber?: string;

  @ApiPropertyOptional({ description: 'Occupation' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  occupation?: string;

  @ApiPropertyOptional({ description: 'Income contribution description' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  incomeContribution?: string;
}
