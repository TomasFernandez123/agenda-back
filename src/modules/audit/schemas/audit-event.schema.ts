import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AuditEventDocument = HydratedDocument<AuditEvent>;

export enum AuditAction {
  APPOINTMENT_CREATED = 'APPOINTMENT_CREATED',
  APPOINTMENT_CONFIRMED = 'APPOINTMENT_CONFIRMED',
  APPOINTMENT_CANCELLED = 'APPOINTMENT_CANCELLED',
  APPOINTMENT_RESCHEDULED = 'APPOINTMENT_RESCHEDULED',
  APPOINTMENT_NO_SHOW = 'APPOINTMENT_NO_SHOW',
  REMINDER_SENT = 'REMINDER_SENT',
  REMINDER_FAILED = 'REMINDER_FAILED',
  TENANT_CREATED = 'TENANT_CREATED',
  TENANT_UPDATED = 'TENANT_UPDATED',
  USER_CREATED = 'USER_CREATED',
  USER_UPDATED = 'USER_UPDATED',
}

@Schema({ timestamps: true })
export class AuditEvent {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorUserId: Types.ObjectId;

  @Prop({ required: true, enum: AuditAction })
  action: AuditAction;

  @Prop({ required: true })
  entityType: string;

  @Prop({ type: Types.ObjectId })
  entityId: Types.ObjectId;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);
AuditEventSchema.index({ tenantId: 1, createdAt: -1 });
AuditEventSchema.index({ entityId: 1, action: 1 });
