import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {
    this.resend = new Resend(
      this.configService.get<string>('app.resendApiKey'),
    );
  }

  async sendEmail(
    tenantId: string,
    params: { to: string; subject: string; text: string; html?: string },
  ): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const from = tenant.emailConfig?.from || 'onboarding@resend.dev';

    this.logger.debug(
      `Preparing email for tenant=${tenantId} to=${params.to} subject="${params.subject}"`,
    );

    try {
      const { data, error } = await this.resend.emails.send({
        from,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });

      if (error) {
        this.logger.error(
          `Resend error for tenant=${tenantId} to=${params.to}: ${error.message}`,
        );
        throw new Error(error.message);
      }

      this.logger.log(
        `Email sent to ${params.to} for tenant ${tenantId} (id=${data?.id})`,
      );
    } catch (error) {
      this.logger.error(
        `Email send failed for tenant=${tenantId} to=${params.to}: ${(error as Error).message}`,
      );
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
