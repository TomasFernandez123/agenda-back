import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { ReminderJob, ReminderJobSchema } from './schemas/reminder-job.schema';
import {
  Appointment,
  AppointmentSchema,
} from '../appointments/schemas/appointment.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { ReminderProcessor } from './reminder.processor';
import { EmailService } from './email.service';
import { TenantsModule } from '../tenants/tenants.module';
import { AuditModule } from '../audit/audit.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ReminderJob.name, schema: ReminderJobSchema },
      { name: Appointment.name, schema: AppointmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({ name: 'reminders' }),
    TenantsModule,
    AuthModule,
    AuditModule,
    WhatsappModule,
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, ReminderProcessor, EmailService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
