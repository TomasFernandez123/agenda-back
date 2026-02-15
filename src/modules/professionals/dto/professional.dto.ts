import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class CreateProfessionalDto {
  @IsString() userId: string;
  @IsString() displayName: string;
  @IsOptional() @IsNumber() minCancelMinutes?: number;
  @IsOptional() @IsNumber() minRescheduleMinutes?: number;
  @IsOptional() @IsBoolean() allowDeposit?: boolean;
}

export class UpdateProfessionalDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsNumber() minCancelMinutes?: number;
  @IsOptional() @IsNumber() minRescheduleMinutes?: number;
  @IsOptional() @IsBoolean() allowDeposit?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
