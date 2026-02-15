import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AppointmentDocument = HydratedDocument<Appointment>;

export enum AppointmentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  RESCHEDULED = 'RESCHEDULED',
  NO_SHOW = 'NO_SHOW',
}

export enum DepositStatus {
  NOT_REQUIRED = 'NOT_REQUIRED',
  PENDING = 'PENDING',
  PAID = 'PAID',
  FAILED = 'FAILED',
}

export enum AppointmentSource {
  ADMIN = 'ADMIN',
  CLIENT = 'CLIENT',
  WHATSAPP = 'WHATSAPP',
}

@Schema({ timestamps: true })
export class Appointment {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Professional', required: true })
  professionalId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Service', required: true })
  serviceId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  clientId: Types.ObjectId;

  @Prop({ required: true })
  startAt: Date;

  @Prop({ required: true })
  endAt: Date;

  @Prop({ required: true, enum: AppointmentStatus, default: AppointmentStatus.PENDING })
  status: AppointmentStatus;

  @Prop()
  notesInternal: string;

  @Prop({ enum: DepositStatus, default: DepositStatus.NOT_REQUIRED })
  depositStatus: DepositStatus;

  @Prop({ required: true, enum: AppointmentSource, default: AppointmentSource.ADMIN })
  source: AppointmentSource;
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);

// Index for overlap queries: find appointments for a professional in a time range
AppointmentSchema.index({ tenantId: 1, professionalId: 1, startAt: 1, endAt: 1 });
// Index for status filtering
AppointmentSchema.index({ tenantId: 1, status: 1 });
// Index for client lookups
AppointmentSchema.index({ tenantId: 1, clientId: 1 });
