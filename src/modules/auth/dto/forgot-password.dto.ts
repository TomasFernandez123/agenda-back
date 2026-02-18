import { IsEmail, IsString } from 'class-validator';

export class ForgotPasswordDto {
  @IsString()
  tenantSlug: string;

  @IsEmail()
  email: string;
}
