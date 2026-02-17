import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly tenantsService: TenantsService) {}

  async sendEmail(
    tenantId: string,
    params: { to: string; subject: string; text: string; html?: string },
  ): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const emailConfig = tenant.emailConfig;

    this.logger.debug(
      `Preparing email for tenant=${tenantId} to=${params.to} subject="${params.subject}"`,
    );

    if (!emailConfig?.host) {
      this.logger.warn(
        `No email config for tenant ${tenantId}, skipping email`,
      );
      return;
    }

    const transporter = nodemailer.createTransport({
      host: emailConfig.host,
      port: emailConfig.port || 587,
      secure: emailConfig.secure || false,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass,
      },
    });

    try {
      const info = await transporter.sendMail({
        from: emailConfig.from || emailConfig.user,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });

      this.logger.log(
        `Email sent to ${params.to} for tenant ${tenantId} (messageId=${info.messageId})`,
      );
    } catch (error) {
      const smtpError = error as Error & {
        code?: string;
        response?: string;
        responseCode?: number;
        command?: string;
      };

      this.logger.error(
        `SMTP send failed for tenant=${tenantId} to=${params.to} code=${smtpError.code || 'N/A'} responseCode=${smtpError.responseCode || 'N/A'} command=${smtpError.command || 'N/A'} message=${smtpError.message}`,
      );
      if (smtpError.response) {
        this.logger.error(`SMTP response: ${smtpError.response}`);
      }

      throw error;
    }
  }

  async sendReminderEmail(
    tenantId: string,
    to: string,
    clientName: string,
    body: string,
  ): Promise<void> {
    await this.sendEmail(tenantId, {
      to,
      subject: 'Recordatorio de turno',
      text: body,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Hola ${clientName}</h2>
          <p>${body}</p>
          <p>Saludos cordiales.</p>
        </div>
      `,
    });
  }
}
