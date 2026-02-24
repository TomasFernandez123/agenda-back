import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { ReminderJob } from './schemas/reminder-job.schema';
import { Appointment } from '../appointments/schemas/appointment.schema';
import { AppointmentStatus } from '../appointments/schemas/appointment.schema';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-event.schema';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EmailService } from './email.service';
import { TenantsService } from '../tenants/tenants.service';
import { AuthService } from '../auth/auth.service';

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
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
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

      const dateText = appointment.startAt.toLocaleDateString('es-AR');
      const timeText = appointment.startAt.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
      });

      const isAlreadyConfirmed =
        appointment.status === AppointmentStatus.CONFIRMED;

      const locationLine = locationText ? `\n📍 ${locationText.replace(/^ en /, '')}` : '';
      const detailLines = `Tenés turno de *${service.name}* con *${professional.displayName}*\n📅 ${dateText} a las ${timeText}${locationLine}`;

      const whatsappMessage = isAlreadyConfirmed
        ? `🔔 *Recordatorio de turno*\n${detailLines}\n\n✅ Tu turno ya está confirmado.`
        : `🔔 *Recordatorio de turno*\n${detailLines}\n\nTu turno sigue pendiente. Si necesitás cambios, respondé *CANCELAR* o *REPROGRAMAR*.`;

      const emailSubject = isAlreadyConfirmed
        ? 'Recordatorio de turno confirmado'
        : 'Recordatorio de turno';

      const plainBaseText = `Tenés turno de ${service.name} con ${professional.displayName} el ${dateText} a las ${timeText}${locationText}.`;
      const emailText = isAlreadyConfirmed
        ? `Recordatorio: ${plainBaseText} Tu turno ya está confirmado.`
        : `Recordatorio: ${plainBaseText} Si necesitás cambios, podés responder CANCELAR para cancelar o REPROGRAMAR para solicitar reprogramación.`;

      const statusBadge = isAlreadyConfirmed ? 'Confirmado' : 'Pendiente';
      const accentColor = isAlreadyConfirmed ? '#059669' : '#2563eb';
      const statusLine = isAlreadyConfirmed
        ? 'Tu turno ya está confirmado. Solo te lo recordamos para que no se te pase.'
        : 'Tu turno sigue pendiente de confirmación.';
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

      const actionLine =
        'Si necesitás cancelar o reprogramar, hacelo desde los enlaces del correo.';

      const emailHtml = `
        <div style="margin:0;padding:0;background-color:#f3f4f6;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f3f4f6;padding:24px 12px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;font-family:Arial,sans-serif;">
                  <tr>
                    <td style="padding:22px 24px;background:${accentColor};color:#ffffff;">
                      <div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;opacity:.9;margin-bottom:8px;">${tenant.name}</div>
                      <div style="font-size:24px;line-height:1.25;font-weight:700;margin:0 0 10px 0;">Recordatorio de turno</div>
                      <span style="display:inline-block;background:rgba(255,255,255,.18);padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;">${statusBadge}</span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:20px 24px 8px 24px;color:#111827;font-size:14px;line-height:1.5;">
                      <p style="margin:0 0 8px 0;">Hola ${client.name},</p>
                      <p style="margin:0 0 8px 0;">${statusLine}</p>
                      <p style="margin:0 0 8px 0;">${actionLine}</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 8px 24px;">
                      <a href="${cancelUrl}" style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:700;margin-right:8px;margin-bottom:8px;">Cancelar turno</a>
                      ${rescheduleUrl ? `<a href="${rescheduleUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:700;margin-bottom:8px;">Reprogramar turno</a>` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 24px 10px 24px;">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#374151;font-size:13px;font-weight:700;width:34%;">Servicio</td>
                          <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${service.name}</td>
                        </tr>
                        <tr>
                          <td style="padding:10px 12px;border:1px solid #e5e7eb;background:#f9fafb;color:#374151;font-size:13px;font-weight:700;">Profesional</td>
                          <td style="padding:10px 12px;border:1px solid #e5e7eb;color:#111827;font-size:14px;">${professional.displayName}</td>
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
                  <tr>
                    <td style="padding:12px 24px 22px 24px;color:#6b7280;font-size:12px;line-height:1.5;">
                      Este es un correo automático de ${tenant.name}.
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>
      `;

      if (channel === 'whatsapp' && client.phone) {
        await this.whatsappService.sendText(
          tenantId,
          client.phone,
          whatsappMessage,
        );
      } else if (channel === 'email' && client.email) {
        const linksText = `\n\nGestioná tu turno desde estos enlaces:\n- Cancelar turno: ${cancelUrl}${rescheduleUrl ? `\n- Reprogramar turno: ${rescheduleUrl}` : ''}`;
        await this.emailService.sendEmail(tenantId, {
          to: [{ email: client.email, name: client.name }],
          subject: emailSubject,
          text: `${emailText}${linksText}`,
          html: emailHtml,
        });
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
