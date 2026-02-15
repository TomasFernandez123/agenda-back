import { IsString, IsDateString, IsOptional, IsEnum } from 'class-validator';
import { AppointmentSource } from '../schemas/appointment.schema';

export class CreateAppointmentDto {
  @IsString() professionalId: string;
  @IsString() serviceId: string;
  @IsString() clientId: string;
  @IsDateString() startAt: string;
  @IsOptional() @IsString() notesInternal?: string;
  @IsOptional() @IsEnum(AppointmentSource) source?: AppointmentSource;
}

export class RescheduleAppointmentDto {
  @IsDateString() startAt: string;
}

export class UpdateAppointmentNotesDto {
  @IsOptional() @IsString() notesInternal?: string;
}

export class QueryAppointmentsDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() professionalId?: string;
  @IsOptional() @IsString() status?: string;
}
