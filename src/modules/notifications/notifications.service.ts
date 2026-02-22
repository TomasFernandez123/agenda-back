import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { ReminderJob } from './schemas/reminder-job.schema';
import { TenantsService } from '../tenants/tenants.service';
import { addMinutes } from 'date-fns';
import {
  Appointment,
  AppointmentSource,
} from '../appointments/schemas/appointment.schema';
import { EmailService } from './email.service';
import { User, UserRole } from '../users/schemas/user.schema';
import { AuthService } from '../auth/auth.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

type AppointmentEmailEvent = 'REQUESTED' | 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULED';

type EmailContact = {
  name?: string;
  email?: string;
};

type EmailServiceInfo = {
  name?: string;
};

type EmailProfessionalInfo = {
  displayName?: string;
  userId?: EmailContact;
};

type ReminderLogAppointmentInfo = {
  client?: { name?: string; email?: string };
  service?: { name?: string };
  professional?: { displayName?: string };
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(ReminderJob.name) private reminderJobModel: Model<ReminderJob>,
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectQueue('reminders') private remindersQueue: Queue,
    private readonly tenantsService: TenantsService,
    private readonly emailService: EmailService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsappService,
  ) {}

  async sendAppointmentEventEmails(
    tenantId: string,
    appointmentId: string,
    event: AppointmentEmailEvent,
  ): Promise<void> {
    try {
      const appointment = await this.appointmentModel
        .findById(appointmentId)
        .populate('clientId', 'name email')
        .populate('serviceId', 'name')
        .populate({
          path: 'professionalId',
          select: 'displayName userId',
          populate: { path: 'userId', select: 'name email' },
        })
        .lean();

      if (!appointment) {
        this.logger.warn(
          `Appointment ${appointmentId} not found, skipping event email`,
        );
        return;
      }

      const [tenant, admins] = await Promise.all([
        this.tenantsService.findById(tenantId),
        this.userModel
          .find({
            tenantId: new Types.ObjectId(tenantId),
            role: UserRole.ADMIN,
            isActive: true,
          })
          .select('name email')
          .lean(),
      ]);

      const client = (appointment.clientId || {}) as unknown as EmailContact;
      const service = (appointment.serviceId ||
        {}) as unknown as EmailServiceInfo;
      const professional = (appointment.professionalId ||
        {}) as unknown as EmailProfessionalInfo;
      const staffUser = professional.userId;

      const dateText = appointment.startAt.toLocaleDateString('es-AR');
      const timeText = appointment.startAt.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const byEvent = {
        REQUESTED: {
          subject: 'Solicitud de turno registrada',
          title: 'Se registró una solicitud de turno',
          accent: '#2563eb',
          badge: 'Solicitud',
        },
        CONFIRMED: {
          subject: 'Turno confirmado',
          title: 'El turno fue confirmado',
          accent: '#059669',
          badge: 'Confirmado',
        },
        CANCELLED: {
          subject: 'Turno cancelado',
          title: 'El turno fue cancelado',
          accent: '#dc2626',
          badge: 'Cancelado',
        },
        RESCHEDULED: {
          subject: 'Turno reprogramado',
          title: 'El turno fue reprogramado',
          accent: '#d97706',
          badge: 'Reprogramado',
        },
      };

      const eventData = byEvent[event];
      const isPublicAppointment =
        appointment.source === AppointmentSource.CLIENT;

      const cancelToken = this.authService.generateActionToken(
        appointmentId,
        'cancel',
      );
      const cancelUrl = `${this.getPublicBaseUrl()}/public/appointments/${appointmentId}/cancel?token=${encodeURIComponent(cancelToken)}`;
      const rescheduleToken = this.authService.generateActionToken(
        appointmentId,
        'reschedule',
      );
      const rescheduleUrl = this.buildRescheduleUrl(
        appointmentId,
        rescheduleToken,
      );

      const recipients = new Map<string, { email: string; name?: string }>();
      for (const admin of admins) {
        if (admin.email) {
          const adminEmail = admin.email.trim();
          recipients.set(adminEmail.toLowerCase(), {
            email: adminEmail,
            name: admin.name,
          });
        }
      }
      if (staffUser?.email) {
        const staffEmail = staffUser.email.trim();
        recipients.set(staffEmail.toLowerCase(), {
          email: staffEmail,
          name: staffUser.name,
        });
      }
      if (client.email) {
        const clientEmail = client.email.trim();
        recipients.set(clientEmail.toLowerCase(), {
          email: clientEmail,
          name: client.name,
        });
      }

      const recipientList = [...recipients.values()];
      const results = await Promise.allSettled(
        recipientList.map((recipient) => {
          const isClientRecipient =
            !!client.email &&
            recipient.email.trim().toLowerCase() ===
              client.email.trim().toLowerCase();
          const shouldAddPublicLinks =
            isPublicAppointment &&
            isClientRecipient &&
            (event === 'REQUESTED' || event === 'CONFIRMED' || event === 'RESCHEDULED');

          const linksText = shouldAddPublicLinks
            ? `\n\nGestioná tu turno desde estos enlaces:\n- Cancelar turno: ${cancelUrl}${rescheduleUrl ? `\n- Reprogramar turno: ${rescheduleUrl}` : ''}`
            : '';

          const linksHtml = shouldAddPublicLinks
            ? `
              <tr>
                <td style="padding:8px 24px 0 24px;color:#111827;font-size:14px;line-height:1.5;">
                  <p style="margin:0 0 10px 0;">Gestioná tu turno desde estos enlaces:</p>
                </td>
              </tr>
              <tr>
                <td style="padding:0 24px 0 24px;">
                  <a href="${cancelUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:700;margin-right:8px;margin-bottom:8px;">Cancelar turno</a>
                  ${rescheduleUrl ? `<a href="${rescheduleUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:700;margin-bottom:8px;">Reprogramar turno</a>` : ''}
                </td>
              </tr>
            `
            : '';

          const text = `${eventData.title}.\n\nNegocio: ${tenant.name}\nServicio: ${service?.name || 'N/A'}\nProfesional: ${professional?.displayName || 'N/A'}\nCliente: ${client?.name || 'N/A'}\nFecha: ${dateText}\nHora: ${timeText}.${linksText}`;

          const html = `
            <div style="margin:0;padding:0;background-color:#f3f4f6;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;padding:24px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;font-family:Arial,sans-serif;">
                      <tr>
                        <td style="padding:22px 24px;background:${eventData.accent};color:#ffffff;">
                          <div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;opacity:.9;margin-bottom:8px;">${tenant.name}</div>
                          <div style="font-size:24px;line-height:1.25;font-weight:700;margin:0 0 10px 0;">${eventData.title}</div>
                          <span style="display:inline-block;background:rgba(255,255,255,.18);padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;">${eventData.badge}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:20px 24px 8px 24px;color:#111827;font-size:14px;line-height:1.5;">
                          <p style="margin:0 0 12px 0;">Te compartimos el detalle del turno:</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 24px 10px 24px;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                            <tr>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#374151;font-size:13px;font-weight:700;width:34%;">Negocio</td>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${tenant.name}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#374151;font-size:13px;font-weight:700;">Servicio</td>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${service?.name || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#374151;font-size:13px;font-weight:700;">Profesional</td>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${professional?.displayName || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#374151;font-size:13px;font-weight:700;">Cliente</td>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${client?.name || 'N/A'}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#374151;font-size:13px;font-weight:700;">Fecha</td>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${dateText}</td>
                            </tr>
                            <tr>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#374151;font-size:13px;font-weight:700;">Hora</td>
                              <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${timeText}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ${linksHtml}
                      <tr>
                        <td style="padding:12px 24px 22px 24px;color:#6b7280;font-size:12px;line-height:1.5;">
                          Este es un correo automático. Si necesitás ayuda, comunicate con ${tenant.name}.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </div>
          `;

          return this.emailService.sendEmail(tenantId, {
            to: [recipient],
            subject: eventData.subject,
            text,
            html,
          });
        }),
      );

      let successCount = 0;
      let failedCount = 0;

      results.forEach((result, index) => {
        const recipient = recipientList[index]?.email || 'unknown';
        if (result.status === 'fulfilled') {
          successCount += 1;
          return;
        }

        failedCount += 1;
        const reason = result.reason as Error;
        this.logger.error(
          `Appointment event email failed event=${event} appointment=${appointmentId} to=${recipient} reason=${reason?.message || 'unknown error'}`,
        );
      });

      this.logger.log(
        `Appointment event emails processed event=${event} appointment=${appointmentId} success=${successCount} failed=${failedCount}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send appointment event emails for ${appointmentId}: ${(error as Error).message}`,
      );
    }
  }

  async sendAppointmentEventWhatsApp(
    tenantId: string,
    appointmentId: string,
    event: AppointmentEmailEvent,
  ): Promise<void> {
    try {
      const appointment = await this.appointmentModel
        .findById(appointmentId)
        .populate('clientId', 'name phone')
        .populate('serviceId', 'name')
        .populate('professionalId', 'displayName')
        .lean();

      if (!appointment) {
        this.logger.warn(
          `Appointment ${appointmentId} not found, skipping WhatsApp notification`,
        );
        return;
      }

      const client = (appointment.clientId || {}) as any;
      if (!client.phone) {
        this.logger.debug(
          `Client has no phone, skipping WhatsApp for appointment ${appointmentId}`,
        );
        return;
      }

      const tenant = await this.tenantsService.findById(tenantId);
      const service = (appointment.serviceId || {}) as any;
      const professional = (appointment.professionalId || {}) as any;

      const dateText = appointment.startAt.toLocaleDateString('es-AR');
      const timeText = appointment.startAt.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const locationText =
        tenant.location?.addressLine1 && tenant.location?.city
          ? ` en ${tenant.location.addressLine1}, ${tenant.location.city}`
          : '';

      const baseText = `Tenés turno de ${service.name || 'N/A'} con ${professional.displayName || 'N/A'} el ${dateText} a las ${timeText}${locationText}.`;

      const byEvent: Record<AppointmentEmailEvent, string> = {
        REQUESTED: `Solicitud registrada: ${baseText} Te avisaremos cuando sea confirmado.`,
        CONFIRMED: `Turno confirmado ✓: ${baseText}`,
        CANCELLED: `Turno cancelado: Tu turno de ${service.name || 'N/A'} con ${professional.displayName || 'N/A'} del ${dateText} a las ${timeText} fue cancelado.`,
        RESCHEDULED: `Turno reprogramado: ${baseText}`,
      };

      const message = byEvent[event];
      await this.whatsappService.sendText(tenantId, client.phone, message);

      this.logger.log(
        `WhatsApp notification sent event=${event} appointment=${appointmentId} to=${client.phone}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp notification for appointment ${appointmentId}: ${
          (error as Error).message
        }`,
      );
    }
  }

  /**
   * Schedule reminder jobs for an appointment based on tenant config.
   */
  async scheduleReminders(
    tenantId: string,
    appointmentId: string,
    startAt: Date,
  ): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const offsets = tenant.reminderOffsets || [
      { offsetMinutes: 1440, channels: ['whatsapp'] },
      { offsetMinutes: 120, channels: ['whatsapp'] },
    ];

    for (const offset of offsets) {
      for (const channel of offset.channels) {
        const scheduledFor = addMinutes(startAt, -offset.offsetMinutes);

        // Don't schedule if already in the past
        if (scheduledFor <= new Date()) {
          this.logger.warn(`Skipping reminder: scheduled time is in the past`);
          continue;
        }

        const reminderJob = await this.reminderJobModel.create({
          tenantId: new Types.ObjectId(tenantId),
          appointmentId: new Types.ObjectId(appointmentId),
          type: `REMINDER_${offset.offsetMinutes}M`,
          scheduledFor,
          channel,
          status: 'pending',
        });
        const reminderJobId = reminderJob._id.toString();

        // Add BullMQ delayed job
        const delay = scheduledFor.getTime() - Date.now();
        const job = await this.remindersQueue.add(
          'send-reminder',
          {
            reminderJobId,
            tenantId,
            appointmentId,
            channel,
          },
          {
            delay,
            attempts: 3,
            backoff: { type: 'exponential', delay: 60000 },
            removeOnComplete: true,
          },
        );

        await this.reminderJobModel.findByIdAndUpdate(reminderJob._id, {
          bullJobId: job.id.toString(),
        });

        this.logger.log(
          `Scheduled ${channel} reminder for appointment ${appointmentId} at ${scheduledFor.toISOString()}`,
        );
      }
    }
  }

  /**
   * Cancel all pending reminder jobs for an appointment.
   */
  async cancelReminders(appointmentId: string): Promise<void> {
    const jobs = await this.reminderJobModel.find({
      appointmentId: new Types.ObjectId(appointmentId),
      status: 'pending',
    });

    for (const job of jobs) {
      if (job.bullJobId) {
        try {
          const bullJob = await this.remindersQueue.getJob(job.bullJobId);
          if (bullJob) await bullJob.remove();
        } catch (error) {
          this.logger.warn(
            `Could not remove Bull job ${job.bullJobId}: ${(error as Error).message}`,
          );
        }
      }
      job.status = 'cancelled';
      await job.save();
    }

    this.logger.log(`Cancelled reminders for appointment ${appointmentId}`);
  }

  async findJobsByTenant(tenantId: string) {
    return this.reminderJobModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ scheduledFor: -1 })
      .limit(100)
      .lean();
  }

  async getReminderLogs(
    tenantId: string,
    limit = 20,
  ): Promise<
    Array<{
      scheduledFor: Date;
      appointment: ReminderLogAppointmentInfo;
      channel: string;
      status: string;
      failureReason?: string;
    }>
  > {
    const safeLimit = Math.min(Math.max(limit, 1), 100);

    const jobs = await this.reminderJobModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ scheduledFor: -1 })
      .limit(safeLimit)
      .populate({
        path: 'appointmentId',
        select: 'clientId serviceId professionalId',
        populate: [
          { path: 'clientId', select: 'name email' },
          { path: 'serviceId', select: 'name' },
          { path: 'professionalId', select: 'displayName' },
        ],
      })
      .lean();

    return jobs.map((job: any) => {
      const appointment = job.appointmentId || {};

      return {
        scheduledFor: job.scheduledFor,
        appointment: {
          client: appointment.clientId
            ? {
                name: appointment.clientId.name,
                email: appointment.clientId.email,
              }
            : undefined,
          service: appointment.serviceId
            ? {
                name: appointment.serviceId.name,
              }
            : undefined,
          professional: appointment.professionalId
            ? {
                displayName: appointment.professionalId.displayName,
              }
            : undefined,
        },
        channel: job.channel,
        status: job.status,
        failureReason: job.lastError || undefined,
      };
    });
  }

  private getPublicBaseUrl(): string {
    const explicit =
      process.env.PUBLIC_APP_BASE_URL || process.env.FRONTEND_BASE_URL;
    if (explicit?.trim()) {
      return explicit.replace(/\/$/, '');
    }

    const corsOrigin = this.configService.get<string>('app.corsOrigin');
    if (corsOrigin?.trim()) {
      return corsOrigin.replace(/\/$/, '');
    }

    return 'http://localhost:4200';
  }

  private buildRescheduleUrl(
    appointmentId: string,
    token: string,
  ): string | null {
    return `${this.getPublicBaseUrl()}/public/appointments/${appointmentId}/reschedule?token=${encodeURIComponent(token)}`;
  }
}
