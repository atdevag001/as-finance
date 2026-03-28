import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateSettingDto {
  @IsNotEmpty()
  value: unknown;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateHolidaysDto {
  @IsNotEmpty()
  @IsString({ each: true })
  holidays!: string[];
}
