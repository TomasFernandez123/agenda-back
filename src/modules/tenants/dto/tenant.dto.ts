import {
  IsString,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

class WhatsAppConfigDto {
  @IsOptional() @IsString() wabaId?: string;
  @IsOptional() @IsString() phoneNumberId?: string;
  @IsOptional() @IsString() accessToken?: string;
  @IsOptional() @IsString() verifyToken?: string;
  @IsOptional() @IsString() appSecret?: string;
  @IsOptional() @IsString() fromNumberDisplay?: string;
  @IsOptional() @IsBoolean() templatesEnabled?: boolean;
}

class EmailConfigDto {
  @IsOptional() @IsString() host?: string;
  @IsOptional() @IsNumber() port?: number;
  @IsOptional() @IsBoolean() secure?: boolean;
  @IsOptional() @IsString() user?: string;
  @IsOptional() @IsString() pass?: string;
  @IsOptional() @IsString() from?: string;
}

class ReminderOffsetDto {
  @IsNumber() offsetMinutes: number;
  @IsArray() @IsString({ each: true }) channels: string[];
}

class ReminderQuietHoursDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsString() start?: string;
  @IsOptional() @IsString() end?: string;
}

class ReminderTemplateDto {
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
}

class ReminderSettingsDto {
  @IsOptional() @IsEnum(['CONFIRMED', 'PENDING', 'BOTH']) appliesTo?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderQuietHoursDto)
  quietHours?: ReminderQuietHoursDto;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderTemplateDto)
  templates?: ReminderTemplateDto[];
}

class LocationDto {
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() province?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() googleMapsUrl?: string;
}

class ProfileDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() logoUrl?: string;
  @IsOptional() @IsBoolean() bookingEnabled?: boolean;
  @IsOptional() @IsString() bookingPageTitle?: string;
  @IsOptional() @IsString() bookingPageDescription?: string;
}

export class CreateTenantDto {
  @IsString() name: string;
  @IsString() slug: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsAppConfigDto)
  whatsappConfig?: WhatsAppConfigDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailConfigDto)
  emailConfig?: EmailConfigDto;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderOffsetDto)
  reminderOffsets?: ReminderOffsetDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderSettingsDto)
  reminderSettings?: ReminderSettingsDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
  @IsOptional() @ValidateNested() @Type(() => ProfileDto) profile?: ProfileDto;
}

export class UpdateTenantDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsEnum(['active', 'suspended']) status?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => WhatsAppConfigDto)
  whatsappConfig?: WhatsAppConfigDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => EmailConfigDto)
  emailConfig?: EmailConfigDto;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReminderOffsetDto)
  reminderOffsets?: ReminderOffsetDto[];
  @IsOptional()
  @ValidateNested()
  @Type(() => ReminderSettingsDto)
  reminderSettings?: ReminderSettingsDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => LocationDto)
  location?: LocationDto;
  @IsOptional() @ValidateNested() @Type(() => ProfileDto) profile?: ProfileDto;
}
