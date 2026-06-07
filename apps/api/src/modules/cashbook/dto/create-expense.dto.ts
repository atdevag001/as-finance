import { IsString, IsInt, Min, IsDateString, IsOptional, IsUUID, MaxLength, IsEnum, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMode, EXPENSE_CATEGORIES, type ExpenseCategory } from '@as-finance/shared';

/**
 * DTO for recording an expense.
 * Amount is in paise (integer). Journal entry (DR Expense, CR Cash/Bank) created atomically.
 */
export class CreateExpenseDto {
  // Whitelist prevents arbitrary strings from silently bucketing to "Other Expense" (5099) and corrupting analytics.
  @ApiProperty({ description: 'Expense category', enum: EXPENSE_CATEGORIES })
  @IsString()
  @MaxLength(100)
  @IsIn(EXPENSE_CATEGORIES as unknown as string[])
  category!: ExpenseCategory;

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

  @ApiPropertyOptional({ description: 'Payment mode (cash, bank_transfer, online). Defaults to cash.' })
  @IsOptional()
  @IsEnum(PaymentMode)
  paymentMode?: PaymentMode;

  @ApiPropertyOptional({ description: 'Optional document file reference (UUID)' })
  @IsOptional()
  @IsUUID()
  documentFileId?: string;
}
