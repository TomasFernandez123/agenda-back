import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ReminderJob } from './schemas/reminder-job.schema';
import { Appointment } from '../appointments/schemas/appointment.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-event.schema';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EmailService } from './email.service';
import { TenantsService } from '../tenants/tenants.service';

interface ReminderJobData {
  reminderJobId: string;
  tenantId: string;
  appointmentId: string;
  channel: string;
}

@Processor('reminders')
export class ReminderProcessor {
  private readonly logger = new Logger(ReminderProcessor.name);

  constructor(
    @InjectModel(ReminderJob.name) private reminderJobModel: Model<ReminderJob>,
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    private readonly auditService: AuditService,
    private readonly whatsappService: WhatsappService,
    private readonly emailService: EmailService,
    private readonly tenantsService: TenantsService,
  ) {}

  @Process('send-reminder')
  async handleReminder(job: Job<ReminderJobData>) {
    const { reminderJobId, tenantId, appointmentId, channel } = job.data;
    this.logger.log(
      `Processing reminder ${reminderJobId} for appointment ${appointmentId}`,
    );

    try {
      const appointment = await this.appointmentModel
        .findById(appointmentId)
        .populate('clientId', 'name email phone')
        .populate('serviceId', 'name')
        .populate('professionalId', 'displayName')
        .lean();

      if (!appointment) {
        this.logger.warn(
          `Appointment ${appointmentId} not found, skipping reminder`,
        );
        await this.updateJobStatus(
          reminderJobId,
          'failed',
          'Appointment not found',
        );
        return;
      }

      if (['CANCELLED', 'NO_SHOW'].includes(appointment.status)) {
        await this.updateJobStatus(
          reminderJobId,
          'cancelled',
          'Appointment cancelled',
        );
        return;
      }

      const client = appointment.clientId as any;
      const service = appointment.serviceId as any;
      const professional = appointment.professionalId as any;

      // Fetch tenant to get location
      const tenant = await this.tenantsService.findById(tenantId);
      let locationText = '';
      if (tenant.location?.addressLine1) {
        locationText = ` en ${tenant.location.addressLine1}`;
        if (tenant.location.city) locationText += `, ${tenant.location.city}`;
      }

      const message = `Recordatorio: Tenés turno de ${service.name} con ${professional.displayName} el ${appointment.startAt.toLocaleDateString('es-AR')} a las ${appointment.startAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}${locationText}. Respondé CONFIRMAR para confirmar o CANCELAR para cancelar.`;

      if (channel === 'whatsapp' && client.phone) {
        await this.whatsappService.sendText(tenantId, client.phone, message);
      } else if (channel === 'email' && client.email) {
        await this.emailService.sendReminderEmail(
          tenantId,
          client.email,
          client.name,
          message,
        );
      }

      await this.updateJobStatus(reminderJobId, 'sent');
      await this.auditService.log(
        tenantId,
        null,
        AuditAction.REMINDER_SENT,
        'ReminderJob',
        reminderJobId,
        { channel, appointmentId },
      );
    } catch (error) {
      this.logger.error(
        `Reminder failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      await this.updateJobStatus(
        reminderJobId,
        'failed',
        (error as Error).message,
      );
      await this.auditService.log(
        tenantId,
        null,
        AuditAction.REMINDER_FAILED,
        'ReminderJob',
        reminderJobId,
        { channel, appointmentId, error: (error as Error).message },
      );
      throw error;
    }
  }

  private async updateJobStatus(id: string, status: string, error?: string) {
    await this.reminderJobModel.findByIdAndUpdate(id, {
      $set: { status, lastError: error },
      $inc: { attempts: 1 },
    });
  }
}
