import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ReminderJob, ReminderJobSchema } from './schemas/reminder-job.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../appointments/schemas/appointment.schema';
import { NotificationsService } from './notifications.service';
import { ReminderProcessor } from './reminder.processor';
import { EmailService } from './email.service';
import { TenantsModule } from '../tenants/tenants.module';
import { AuditModule } from '../audit/audit.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReminderJob.name, schema: ReminderJobSchema },
      { name: Appointment.name, schema: AppointmentSchema },
    ]),
    BullModule.registerQueue({ name: 'reminders' }),
    TenantsModule,
    AuditModule,
    WhatsappModule,
  ],
  providers: [NotificationsService, ReminderProcessor, EmailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
