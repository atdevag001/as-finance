import { IsString, IsInt, Min, IsDateString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for recording an expense.
 * Amount is in paise (integer). Journal entry (DR Expense, CR Cash/Bank) created atomically.
 */
export class CreateExpenseDto {
  @ApiProperty({ description: 'Expense category (e.g., salary, rent, travel, office, other)' })
  @IsString()
  @MaxLength(100)
  category!: string;

  @ApiProperty({ description: 'Amount in paise (integer, positive)' })
  @IsInt()
  @Min(1)
  amountPaise!: number;

  @ApiProperty({ description: 'Expense date (ISO 8601)' })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: 'Description of the expense' })
  @IsString()
  @MaxLength(1000)
  description!: string;

  @ApiPropertyOptional({ description: 'Optional document file reference (UUID)' })
  @IsOptional()
  @IsUUID()
  documentFileId?: string;
}
