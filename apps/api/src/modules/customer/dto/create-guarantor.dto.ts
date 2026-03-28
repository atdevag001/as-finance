import {
  IsNotEmpty,
  IsString,
  IsOptional,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGuarantorDto {
  @ApiProperty({ description: 'Guarantor name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Relationship to customer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  relationship!: string;

  @ApiProperty({ description: 'Mobile number (10 digits starting with 6-9)' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  mobile!: string;

  @ApiProperty({ description: 'Aadhaar number (exactly 12 digits)' })
  @IsString()
  @Matches(/^\d{12}$/, { message: 'Aadhaar must be exactly 12 digits' })
  aadhaarNumber!: string;

  @ApiProperty({ description: 'Full address' })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiPropertyOptional({ description: 'Photo file ID (UUID)' })
  @IsOptional()
  @IsString()
  photoFileId?: string;
}
