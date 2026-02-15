import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TenantDocument = HydratedDocument<Tenant>;

@Schema({ _id: false })
export class WhatsAppConfig {
  @Prop() wabaId: string;
  @Prop() phoneNumberId: string;
  @Prop() accessToken: string;
  @Prop() verifyToken: string;
  @Prop() appSecret: string;
  @Prop() fromNumberDisplay: string;
  @Prop({ default: false }) templatesEnabled: boolean;
}

@Schema({ _id: false })
export class EmailConfig {
  @Prop() host: string;
  @Prop() port: number;
  @Prop({ default: false }) secure: boolean;
  @Prop() user: string;
  @Prop() pass: string;
  @Prop() from: string;
}

@Schema({ _id: false })
export class ReminderOffset {
  @Prop({ required: true }) offsetMinutes: number;
  @Prop({ type: [String], enum: ['whatsapp', 'email'], default: ['whatsapp'] })
  channels: string[];
}

@Schema({ _id: false })
export class Location {
  @Prop() addressLine1: string;
  @Prop() addressLine2: string;
  @Prop() city: string;
  @Prop() province: string;
  @Prop() postalCode: string;
  @Prop() country: string;
  @Prop() googleMapsUrl: string;
}

@Schema({ _id: false })
export class Profile {
  @Prop() phone: string;
  @Prop() logoUrl: string;
  @Prop({ default: true }) bookingEnabled: boolean;
  @Prop() bookingPageTitle: string;
  @Prop() bookingPageDescription: string;
}

@Schema({ timestamps: true })
export class Tenant {
  @Prop({ required: true }) name: string;
  @Prop({ unique: true, required: true }) slug: string;
  @Prop({ default: 'America/Argentina/Buenos_Aires' }) timezone: string;
  @Prop({ enum: ['active', 'suspended'], default: 'active' }) status: string;
  @Prop({ type: WhatsAppConfig }) whatsappConfig: WhatsAppConfig;
  @Prop({ type: EmailConfig }) emailConfig: EmailConfig;
  @Prop({
    type: [ReminderOffset],
    default: [
      { offsetMinutes: 1440, channels: ['whatsapp'] },
      { offsetMinutes: 120, channels: ['whatsapp'] },
    ],
  })
  reminderOffsets: ReminderOffset[];

  @Prop({ type: Location }) location: Location;
  @Prop({ type: Profile }) profile: Profile;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
