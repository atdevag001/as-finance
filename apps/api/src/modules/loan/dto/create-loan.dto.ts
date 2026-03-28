import {
  IsNotEmpty,
  IsString,
  IsInt,
  IsUUID,
  IsOptional,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLoanDto {
  @ApiProperty({ description: 'Customer UUID' })
  @IsUUID()
  @IsNotEmpty()
  customerId!: string;

  @ApiProperty({ description: 'Loan product version UUID' })
  @IsUUID()
  @IsNotEmpty()
  productVersionId!: string;

  @ApiProperty({ description: 'Requested principal amount in paise' })
  @IsInt()
  @Min(1)
  principalPaise!: number;

  @ApiProperty({ description: 'Requested tenure in months' })
  @IsInt()
  @Min(1)
  tenureMonths!: number;

  @ApiProperty({ description: 'Purpose of the loan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  purpose!: string;

  @ApiPropertyOptional({ description: 'Group UUID (for group loans)' })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}
