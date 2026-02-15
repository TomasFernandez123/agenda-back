import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AvailabilityDocument = HydratedDocument<Availability>;

@Schema({ _id: false })
export class TimeRange {
  @Prop({ required: true }) start: string; // "09:00"
  @Prop({ required: true }) end: string;   // "13:00"
}

@Schema({ _id: false })
export class WeeklyRule {
  @Prop({ required: true, min: 0, max: 6 }) day: number; // 0=Sunday, 6=Saturday
  @Prop({ type: [TimeRange], default: [] }) ranges: TimeRange[];
}

@Schema({ _id: false })
export class AvailabilityException {
  @Prop({ required: true }) date: string; // "2026-03-15"
  @Prop({ type: [TimeRange], default: [] }) ranges: TimeRange[];
  @Prop({ required: true, enum: ['blocked', 'extra'] }) type: string;
}

@Schema({ timestamps: true })
export class Availability {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Professional', required: true })
  professionalId: Types.ObjectId;

  @Prop({ type: [WeeklyRule], default: [] })
  weeklyRules: WeeklyRule[];

  @Prop({ type: [AvailabilityException], default: [] })
  exceptions: AvailabilityException[];
}

export const AvailabilitySchema = SchemaFactory.createForClass(Availability);
AvailabilitySchema.index({ tenantId: 1, professionalId: 1 }, { unique: true });
