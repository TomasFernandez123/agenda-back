import { IsArray, ValidateNested, IsOptional, IsNumber, IsString, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';

class TimeRangeDto {
  @IsString() start: string;
  @IsString() end: string;
}

class WeeklyRuleDto {
  @IsNumber() day: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TimeRangeDto) ranges: TimeRangeDto[];
}

class ExceptionDto {
  @IsString() date: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => TimeRangeDto) ranges: TimeRangeDto[];
  @IsEnum(['blocked', 'extra']) type: string;
}

export class SetAvailabilityDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => WeeklyRuleDto) weeklyRules: WeeklyRuleDto[];
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ExceptionDto) exceptions?: ExceptionDto[];
}
