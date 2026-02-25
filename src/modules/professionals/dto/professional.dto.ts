import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  IsMongoId,
} from 'class-validator';

export class CreateProfessionalDto {
  @IsString() userId: string;
  @IsString() displayName: string;
  @IsOptional() @IsNumber() minCancelMinutes?: number;
  @IsOptional() @IsNumber() minRescheduleMinutes?: number;
  @IsOptional() @IsBoolean() allowDeposit?: boolean;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) serviceIds?: string[];
}

export class UpdateProfessionalDto {
  @IsOptional() @IsString() displayName?: string;
  @IsOptional() @IsNumber() minCancelMinutes?: number;
  @IsOptional() @IsNumber() minRescheduleMinutes?: number;
  @IsOptional() @IsBoolean() allowDeposit?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsMongoId({ each: true }) serviceIds?: string[];
}
