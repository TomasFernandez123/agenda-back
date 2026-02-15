import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProfessionalDocument = HydratedDocument<Professional>;

@Schema({ _id: false })
export class ProfessionalRules {
  @Prop({ default: 60 }) minCancelMinutes: number;
  @Prop({ default: 60 }) minRescheduleMinutes: number;
}

@Schema({ _id: false })
export class BookingSettings {
  @Prop({ default: false }) allowDeposit: boolean;
}

@Schema({ timestamps: true })
export class Professional {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  displayName: string;

  @Prop({ type: ProfessionalRules, default: () => ({}) })
  rules: ProfessionalRules;

  @Prop({ type: BookingSettings, default: () => ({}) })
  bookingSettings: BookingSettings;

  @Prop({ default: true })
  isActive: boolean;
}

export const ProfessionalSchema = SchemaFactory.createForClass(Professional);
ProfessionalSchema.index({ tenantId: 1, userId: 1 }, { unique: true });
