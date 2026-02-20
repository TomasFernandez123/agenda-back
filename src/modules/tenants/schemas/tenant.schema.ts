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
  @Prop() from: string;
}

@Schema({ _id: false })
export class ReminderOffset {
  @Prop({ required: true }) offsetMinutes: number;
  @Prop({ type: [String], enum: ['whatsapp', 'email'], default: ['whatsapp'] })
  channels: string[];
}

@Schema({ _id: false })
export class ReminderQuietHours {
  @Prop({ default: false }) enabled: boolean;
  @Prop({ default: '22:00' }) start: string;
  @Prop({ default: '08:00' }) end: string;
}

@Schema({ _id: false })
export class ReminderTemplate {
  @Prop({ default: 'default' }) type: string;
  @Prop() subject: string;
  @Prop() body: string;
}

@Schema({ _id: false })
export class ReminderSettings {
  @Prop({ enum: ['CONFIRMED', 'PENDING', 'BOTH'], default: 'BOTH' })
  appliesTo: string;

  @Prop({
    type: ReminderQuietHours,
    default: { enabled: false, start: '22:00', end: '08:00' },
  })
  quietHours: ReminderQuietHours;

  @Prop({ type: [ReminderTemplate], default: [] })
  templates: ReminderTemplate[];
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

  @Prop({
    type: ReminderSettings,
    default: {
      appliesTo: 'BOTH',
      quietHours: { enabled: false, start: '22:00', end: '08:00' },
      templates: [],
    },
  })
  reminderSettings: ReminderSettings;

  @Prop({ type: Location }) location: Location;
  @Prop({ type: Profile }) profile: Profile;
}

export const TenantSchema = SchemaFactory.createForClass(Tenant);
