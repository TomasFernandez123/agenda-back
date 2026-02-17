import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const normalizeText = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim();
};

const normalizeEmail = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
};

const normalizePhone = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';
  return `${hasPlus ? '+' : ''}${digits}`;
};

export class CreatePublicAppointmentDto {
  @IsMongoId()
  professionalId: string;

  @IsMongoId()
  serviceId: string;

  @IsDateString()
  startAt: string;

  @Transform(normalizeText)
  @IsString()
  @MinLength(2)
  guestName: string;

  @Transform(normalizeEmail)
  @IsEmail()
  guestEmail: string;

  @Transform(normalizePhone)
  @IsString()
  @MinLength(8)
  guestPhone: string;

  @Transform(normalizeText)
  @IsOptional()
  @IsString()
  notesInternal?: string;
}
