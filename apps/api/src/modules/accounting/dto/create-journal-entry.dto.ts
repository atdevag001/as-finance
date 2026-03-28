import {
  IsArray,
  IsDateString,
  IsEnum,
  IsString,
  IsUUID,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { JournalSourceType } from '@as-finance/shared';

export class JournalLineDto {
  @ApiProperty({ description: 'Chart of accounts ID' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ description: 'Debit amount in paise (integer)' })
  debitPaise!: number;

  @ApiProperty({ description: 'Credit amount in paise (integer)' })
  creditPaise!: number;
}

export class CreateJournalEntryDto {
  @ApiProperty({ description: 'Entry date (ISO 8601)' })
  @IsDateString()
  date!: string;

  @ApiProperty({ description: 'Description of the journal entry' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Source type', enum: JournalSourceType })
  @IsEnum(JournalSourceType)
  sourceType!: JournalSourceType;

  @ApiProperty({ description: 'Source entity ID' })
  @IsUUID()
  sourceId!: string;

  @ApiProperty({ description: 'Journal lines (debit/credit)', type: [JournalLineDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];

  /** Actor ID — set by the service layer, not from request body */
  createdBy?: string;
}
