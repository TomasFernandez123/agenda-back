import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class QueryReminderLogsDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
