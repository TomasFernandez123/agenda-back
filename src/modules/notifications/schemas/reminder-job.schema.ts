import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReminderJobDocument = HydratedDocument<ReminderJob>;

@Schema({ timestamps: true })
export class ReminderJob {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Appointment', required: true })
  appointmentId: Types.ObjectId;

  @Prop({ required: true })
  type: string; // REMINDER_24H, REMINDER_2H, etc.

  @Prop({ required: true })
  scheduledFor: Date;

  @Prop({ enum: ['pending', 'sent', 'failed', 'cancelled'], default: 'pending' })
  status: string;

  @Prop({ required: true, enum: ['whatsapp', 'email'] })
  channel: string;

  @Prop({ default: 0 })
  attempts: number;

  @Prop()
  lastError: string;

  @Prop()
  bullJobId: string;
}

export const ReminderJobSchema = SchemaFactory.createForClass(ReminderJob);
ReminderJobSchema.index({ appointmentId: 1, status: 1 });
