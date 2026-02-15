import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly graphApiUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Send a text message via WhatsApp Cloud API for a specific tenant.
   */
  async sendText(tenantId: string, to: string, body: string): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const waConfig = tenant.whatsappConfig;

    if (!waConfig?.phoneNumberId || !waConfig?.accessToken) {
      this.logger.warn(`WhatsApp not configured for tenant ${tenantId}`);
      return;
    }

    try {
      const url = `${this.graphApiUrl}/${waConfig.phoneNumberId}/messages`;
      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to.replace(/[^0-9]/g, ''), // Clean phone number
          type: 'text',
          text: { preview_url: false, body },
        },
        {
          headers: {
            Authorization: `Bearer ${waConfig.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
      this.logger.log(`WhatsApp message sent to ${to} for tenant ${tenantId}`);
    } catch (error) {
      this.logger.error(
        `WhatsApp send failed: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  /**
   * Send a message with action buttons (interactive).
   */
  async sendWithButtons(
    tenantId: string,
    to: string,
    body: string,
    buttons: { id: string; title: string }[],
  ): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const waConfig = tenant.whatsappConfig;

    if (!waConfig?.phoneNumberId || !waConfig?.accessToken) return;

    try {
      const url = `${this.graphApiUrl}/${waConfig.phoneNumberId}/messages`;
      await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to.replace(/[^0-9]/g, ''),
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: body },
            action: {
              buttons: buttons.map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title },
              })),
            },
          },
        },
        {
          headers: {
            Authorization: `Bearer ${waConfig.accessToken}`,
            'Content-Type': 'application/json',
          },
        },
      );
    } catch (error) {
      this.logger.error(`WhatsApp interactive send failed: ${error.message}`);
      throw error;
    }
  }
}
