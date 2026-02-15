import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsOptional() @IsString() tenantSlug?: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}
