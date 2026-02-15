import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly tenantsService: TenantsService) {}

  async sendReminderEmail(
    tenantId: string,
    to: string,
    clientName: string,
    body: string,
  ): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const emailConfig = tenant.emailConfig;

    if (!emailConfig?.host) {
      this.logger.warn(`No email config for tenant ${tenantId}, skipping email`);
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

    await transporter.sendMail({
      from: emailConfig.from || emailConfig.user,
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

    this.logger.log(`Email sent to ${to} for tenant ${tenantId}`);
  }
}
