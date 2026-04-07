import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ description: 'Full name of the customer' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName!: string;

  @ApiPropertyOptional({ description: 'Father or husband name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fatherOrHusbandName?: string;

  @ApiProperty({ description: 'Mobile number (10 digits starting with 6-9)' })
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  mobile!: string;

  @ApiPropertyOptional({ description: 'Alternate mobile number' })
  @IsOptional()
  @ValidateIf((o) => o.alternateMobile !== '' && o.alternateMobile != null)
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  alternateMobile?: string;

  @ApiProperty({ description: 'Aadhaar number (exactly 12 digits)' })
  @IsString()
  @Matches(/^\d{12}$/, { message: 'Aadhaar must be exactly 12 digits' })
  aadhaarNumber!: string;

  @ApiPropertyOptional({ description: 'PAN number (format: AAAAA9999A)' })
  @IsOptional()
  @ValidateIf((o) => o.panNumber !== '' && o.panNumber != null)
  @IsString()
  @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: 'Invalid PAN format' })
  panNumber?: string;

  @ApiPropertyOptional({ description: 'Date of birth (ISO 8601)' })
  @IsOptional()
  @IsString()
  dob?: string;

  @ApiPropertyOptional({ description: 'Age (if DOB not available)' })
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(120)
  age?: number;

  @ApiProperty({ description: 'Gender', enum: ['male', 'female', 'other'] })
  @IsEnum(['male', 'female', 'other'])
  gender!: string;

  @ApiPropertyOptional({ description: 'Occupation' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  occupation?: string;

  @ApiPropertyOptional({ description: 'Monthly income in paise' })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyIncomePaise?: number;

  @ApiPropertyOptional({ description: 'Work or business details' })
  @IsOptional()
  @IsString()
  workOrBusinessDetails?: string;

  @ApiProperty({ description: 'Address line 1' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  addressLine1!: string;

  @ApiPropertyOptional({ description: 'Address line 2' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine2?: string;

  @ApiProperty({ description: 'City' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty({ description: 'District' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  district!: string;

  @ApiProperty({ description: 'State' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @ApiProperty({ description: 'Pincode (6 digits)' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits' })
  pincode!: string;

  @ApiPropertyOptional({ description: 'Photo file ID (UUID)' })
  @IsOptional()
  @IsString()
  photoFileId?: string;

  @ApiPropertyOptional({ description: 'Assigned field officer ID (UUID)' })
  @IsOptional()
  @IsString()
  assignedOfficerId?: string;

  @ApiPropertyOptional({ description: 'Notes about the customer' })
  @IsOptional()
  @IsString()
  notes?: string;
}
