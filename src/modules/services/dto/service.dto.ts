import { IsString, IsNumber, IsBoolean, IsOptional } from 'class-validator';

export class CreateServiceDto {
  @IsString() name: string;
  @IsNumber() durationMinutes: number;
  @IsNumber() price: number;
  @IsOptional() @IsBoolean() depositEnabled?: boolean;
  @IsOptional() @IsNumber() depositAmount?: number;
  @IsOptional() @IsNumber() depositPercentage?: number;
  @IsOptional() @IsBoolean() depositRequired?: boolean;
}

export class UpdateServiceDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() durationMinutes?: number;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsBoolean() depositEnabled?: boolean;
  @IsOptional() @IsNumber() depositAmount?: number;
  @IsOptional() @IsNumber() depositPercentage?: number;
  @IsOptional() @IsBoolean() depositRequired?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
