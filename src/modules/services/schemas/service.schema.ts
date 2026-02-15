import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ServiceDocument = HydratedDocument<Service>;

@Schema({ _id: false })
export class DepositConfig {
  @Prop({ default: false }) enabled: boolean;
  @Prop() amount: number;
  @Prop() percentage: number;
  @Prop({ default: false }) required: boolean;
}

@Schema({ timestamps: true })
export class Service {
  @Prop({ type: Types.ObjectId, ref: 'Tenant', required: true, index: true })
  tenantId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  durationMinutes: number;

  @Prop({ required: true })
  price: number;

  @Prop({ type: DepositConfig, default: () => ({}) })
  deposit: DepositConfig;

  @Prop({ default: true })
  isActive: boolean;
}

export const ServiceSchema = SchemaFactory.createForClass(Service);
