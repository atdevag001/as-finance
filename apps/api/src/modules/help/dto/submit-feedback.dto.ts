import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SubmitHelpFeedbackDto {
  @ApiProperty({ example: 'collections', description: 'Chapter slug' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  chapter!: string;

  @ApiProperty({ example: 'post', description: 'Section id within the chapter' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sectionId!: string;

  @ApiProperty({ enum: ['en', 'hi', 'hinglish'], example: 'hinglish' })
  @IsIn(['en', 'hi', 'hinglish'])
  lang!: 'en' | 'hi' | 'hinglish';

  @ApiProperty({ enum: ['up', 'down'], example: 'down' })
  @IsIn(['up', 'down'])
  vote!: 'up' | 'down';

  @ApiPropertyOptional({ description: 'Optional free-text comment from the reader', maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
