import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SendSmtpEmail,
  TransactionalEmailsApi,
  TransactionalEmailsApiApiKeys,
} from '@getbrevo/brevo';
import { TenantsService } from '../tenants/tenants.service';

type EmailRecipient = {
  email: string;
  name?: string;
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly brevoApi: TransactionalEmailsApi;
  private readonly senderEmail = 'notificaciones@syncrolab.tech';

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {
    this.brevoApi = new TransactionalEmailsApi();
    this.brevoApi.setApiKey(
      TransactionalEmailsApiApiKeys.apiKey,
      this.configService.get<string>('app.brevoApiKey') ?? '',
    );
  }

  async sendEmail(
    tenantId: string,
    params: {
      to: EmailRecipient[];
      subject: string;
      text?: string;
      html?: string;
    },
  ): Promise<void> {
    if (!params.to.length) {
      this.logger.warn(
        `Skipping email for tenant=${tenantId} because recipients are empty`,
      );
      return;
    }

    const tenant = await this.tenantsService.findById(tenantId);
    const senderName = tenant.name || 'Syncro';
    const rawFrom = tenant.emailConfig?.from?.trim();
    // emailConfig.from may be stored as "Name <email@domain.com>" or plain "email@domain.com"
    const replyToEmail = rawFrom
      ? (rawFrom.match(/<([^>]+)>/)?.[1] ?? rawFrom)
      : undefined;
    const recipients = params.to.map((recipient) => recipient.email).join(', ');

    this.logger.debug(
      `Preparing email for tenant=${tenantId} to=${recipients} subject="${params.subject}" replyTo=${replyToEmail ?? 'none'}`,
    );

    try {
      const message = new SendSmtpEmail();
      message.sender = {
        name: senderName,
        email: this.senderEmail,
      };
      message.to = params.to;
      message.subject = params.subject;
      message.textContent = params.text;
      message.htmlContent = params.html;

      if (replyToEmail) {
        message.replyTo = {
          email: replyToEmail,
          name: senderName,
        };
      }

      await this.brevoApi.sendTransacEmail(message);

      this.logger.log(`Email sent to ${recipients} for tenant ${tenantId}`);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'unknown provider error';
      const responseBody =
        (error as any)?.response?.body ?? (error as any)?.response?.data;
      this.logger.error(
        `Brevo email send failed for tenant=${tenantId} to=${recipients}: ${reason}${responseBody ? ` — ${JSON.stringify(responseBody)}` : ''}`,
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
      to: [{ email: to, name: clientName }],
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
