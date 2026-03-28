import {
  IsOptional,
  IsString,
  IsEnum,
  IsInt,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCustomerDto {
  @ApiPropertyOptional({ description: 'Full name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ description: 'Father or husband name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fatherOrHusbandName?: string;

  @ApiPropertyOptional({ description: 'Mobile number' })
  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  mobile?: string;

  @ApiPropertyOptional({ description: 'Alternate mobile number' })
  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, { message: 'Invalid Indian mobile number' })
  alternateMobile?: string;

  @ApiPropertyOptional({ description: 'PAN number' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{5}\d{4}[A-Z]$/, { message: 'Invalid PAN format' })
  panNumber?: string;

  @ApiPropertyOptional({ description: 'Date of birth (ISO 8601)' })
  @IsOptional()
  @IsString()
  dob?: string;

  @ApiPropertyOptional({ description: 'Age' })
  @IsOptional()
  @IsInt()
  @Min(18)
  @Max(120)
  age?: number;

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

  @ApiPropertyOptional({ description: 'Address line 1' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine1?: string;

  @ApiPropertyOptional({ description: 'Address line 2' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  addressLine2?: string;

  @ApiPropertyOptional({ description: 'City' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ description: 'District' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  district?: string;

  @ApiPropertyOptional({ description: 'State' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ description: 'Pincode' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Pincode must be 6 digits' })
  pincode?: string;

  @ApiPropertyOptional({ description: 'Risk level', enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsEnum(['low', 'medium', 'high'])
  riskLevel?: string;

  @ApiPropertyOptional({ description: 'Photo file ID' })
  @IsOptional()
  @IsString()
  photoFileId?: string;

  @ApiPropertyOptional({ description: 'Assigned officer ID' })
  @IsOptional()
  @IsString()
  assignedOfficerId?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}
