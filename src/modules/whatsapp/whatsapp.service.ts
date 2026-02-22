import {
  Injectable,
  Logger,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { TenantsService } from '../tenants/tenants.service';

export type WaStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export interface EvolutionInstanceStatus {
  instance: {
    instanceName: string;
    state: string; // 'open' | 'close' | 'connecting'
  };
}

export interface EvolutionQrResponse {
  code: string;
  base64: string;
}

interface EvolutionError {
  message?: string;
}

function extractEvoError(err: unknown): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as EvolutionError | undefined;
    return data?.message ?? err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly http: AxiosInstance;
  private readonly webhookUrl: string;

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly configService: ConfigService,
  ) {
    const apiUrl = this.configService.get<string>('app.evolution.apiUrl') ?? '';
    const apiKey = this.configService.get<string>('app.evolution.apiKey') ?? '';
    this.webhookUrl =
      this.configService.get<string>('app.evolution.webhookUrl') ?? '';

    this.http = axios.create({
      baseURL: apiUrl,
      headers: {
        apikey: apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Instance lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Creates an Evolution API instance for the given tenant.
   * Generates a unique instance name based on the tenantId.
   * Automatically sets up the webhook if configured.
   */
  async createInstance(tenantId: string): Promise<{ instanceName: string }> {
    const instanceName = this.buildInstanceName(tenantId);

    try {
      await this.http.post('/instance/create', {
        instanceName,
        token: instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      });
      this.logger.log(`Instance created: ${instanceName}`);
    } catch (err: unknown) {
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const msg =
          (err.response?.data as EvolutionError | undefined)?.message ?? '';
        if (status !== 409 && !msg.toLowerCase().includes('already')) {
          this.logger.error(`createInstance failed: ${extractEvoError(err)}`);
          throw new InternalServerErrorException(
            'No se pudo crear la instancia de WhatsApp',
          );
        }
        this.logger.warn(
          `Instance ${instanceName} already exists — continuing.`,
        );
      }
    }

    await this.tenantsService.updateWhatsappConfig(tenantId, {
      instanceName,
      waStatus: 'DISCONNECTED',
    });

    if (this.webhookUrl) {
      await this.setWebhook(instanceName, this.webhookUrl).catch((e: unknown) =>
        this.logger.warn(`Could not set webhook: ${extractEvoError(e)}`),
      );
    }

    return { instanceName };
  }

  /**
   * Returns the base64 QR code for the user to scan.
   */
  async getQrCode(tenantId: string): Promise<EvolutionQrResponse> {
    const tenant = await this.tenantsService.findById(tenantId);
    const instanceName = tenant.whatsappConfig?.instanceName;

    if (!instanceName) {
      throw new BadRequestException(
        'No hay instancia de WhatsApp creada para este tenant. Creala primero.',
      );
    }

    try {
      const res = await this.http.get<EvolutionQrResponse>(
        `/instance/connect/${instanceName}`,
      );
      this.logger.log(`QR fetched for ${instanceName}`);
      return res.data;
    } catch (err: unknown) {
      this.logger.error(`getQrCode failed: ${extractEvoError(err)}`);
      throw new InternalServerErrorException(
        'No se pudo obtener el QR de WhatsApp',
      );
    }
  }

  /**
   * Returns the current connection state of the instance.
   */
  async getInstanceStatus(
    tenantId: string,
  ): Promise<{ status: WaStatus; instanceName: string }> {
    const tenant = await this.tenantsService.findById(tenantId);
    const instanceName = tenant.whatsappConfig?.instanceName;

    if (!instanceName) {
      return { status: 'DISCONNECTED', instanceName: '' };
    }

    try {
      const res = await this.http.get<EvolutionInstanceStatus>(
        `/instance/connectionState/${instanceName}`,
      );
      const rawState = res.data?.instance?.state ?? 'close';
      const status = this.mapEvolutionState(rawState);

      if (tenant.whatsappConfig?.waStatus !== status) {
        await this.tenantsService.updateWhatsappConfig(tenantId, {
          waStatus: status,
        });
      }

      return { status, instanceName };
    } catch (err: unknown) {
      this.logger.warn(
        `getInstanceStatus failed for ${instanceName}: ${extractEvoError(err)}`,
      );
      return { status: 'DISCONNECTED', instanceName };
    }
  }

  /**
   * Deletes the Evolution instance and clears the tenant's WhatsApp config.
   */
  async deleteInstance(tenantId: string): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const instanceName = tenant.whatsappConfig?.instanceName;

    if (!instanceName) {
      this.logger.warn(
        `deleteInstance: no instance found for tenant ${tenantId}`,
      );
      return;
    }

    try {
      await this.http.delete(`/instance/delete/${instanceName}`);
      this.logger.log(`Instance deleted: ${instanceName}`);
    } catch (err: unknown) {
      this.logger.error(`deleteInstance failed: ${extractEvoError(err)}`);
    }

    await this.tenantsService.updateWhatsappConfig(tenantId, {
      instanceName: '',
      waStatus: 'DISCONNECTED',
    });
  }

  /**
   * Configures the webhook URL for an instance.
   */
  async setWebhook(instanceName: string, webhookUrl: string): Promise<void> {
    await this.http.put(`/webhook/set/${instanceName}`, {
      url: webhookUrl,
      webhook_by_events: true,
      webhook_base64: false,
      events: [
        'MESSAGES_UPSERT',
        'CONNECTION_UPDATE',
        'MESSAGES_UPDATE',
        'SEND_MESSAGE',
      ],
    });
    this.logger.log(`Webhook configured for ${instanceName}: ${webhookUrl}`);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Messaging
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Send a plain text message via the tenant's WhatsApp instance.
   */
  async sendText(tenantId: string, to: string, body: string): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const instanceName = tenant.whatsappConfig?.instanceName;
    const waStatus = tenant.whatsappConfig?.waStatus;

    if (!instanceName) {
      this.logger.warn(
        `sendText: no instance for tenant ${tenantId}. Skipping.`,
      );
      return;
    }

    if (waStatus !== 'CONNECTED') {
      this.logger.warn(
        `sendText: instance ${instanceName} is ${waStatus ?? 'DISCONNECTED'}. Skipping.`,
      );
      return;
    }

    const cleanNumber = this.cleanPhone(to);

    // Best-effort "composing" presence for a human feel
    try {
      await this.http.post(`/chat/presence/${instanceName}`, {
        number: cleanNumber,
        options: { presence: 'composing', delay: 1200 },
      });
    } catch {
      // Presence is non-critical
    }

    try {
      await this.http.post(`/message/sendText/${instanceName}`, {
        number: cleanNumber,
        textMessage: { text: body },
        options: { delay: 1200 },
      });
      this.logger.log(`Message sent to ${cleanNumber} via ${instanceName}`);
    } catch (err: unknown) {
      this.logger.error(
        `sendText failed to ${cleanNumber}: ${extractEvoError(err)}`,
      );
      throw err;
    }
  }

  /**
   * Send an interactive button message.
   */
  async sendWithButtons(
    tenantId: string,
    to: string,
    body: string,
    buttons: { id: string; title: string }[],
  ): Promise<void> {
    const tenant = await this.tenantsService.findById(tenantId);
    const instanceName = tenant.whatsappConfig?.instanceName;

    if (!instanceName || tenant.whatsappConfig?.waStatus !== 'CONNECTED') {
      this.logger.warn(
        `sendWithButtons: instance not ready for tenant ${tenantId}. Skipping.`,
      );
      return;
    }

    const cleanNumber = this.cleanPhone(to);

    try {
      await this.http.post(`/message/sendButtons/${instanceName}`, {
        number: cleanNumber,
        buttonMessage: {
          text: body,
          buttons: buttons.map((b) => ({
            buttonId: b.id,
            buttonText: { displayText: b.title },
            type: 1,
          })),
          footerText: 'Syncro',
        },
      });
      this.logger.log(
        `Button message sent to ${cleanNumber} via ${instanceName}`,
      );
    } catch (err: unknown) {
      this.logger.error(`sendWithButtons failed: ${extractEvoError(err)}`);
      throw err;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Webhook event handling
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Handles CONNECTION_UPDATE events from Evolution webhooks.
   */
  async handleConnectionUpdate(
    instanceName: string,
    state: string,
  ): Promise<void> {
    const status = this.mapEvolutionState(state);
    this.logger.log(
      `Connection update: ${instanceName} → ${state} (${status})`,
    );

    const tenant = await this.tenantsService
      .findByWhatsappInstance(instanceName)
      .catch(() => null);

    if (tenant) {
      const tenantId = (
        tenant as unknown as { _id: { toString(): string } }
      )._id.toString();
      await this.tenantsService.updateWhatsappConfig(tenantId, {
        waStatus: status,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  private buildInstanceName(tenantId: string): string {
    const shortId = tenantId.replace(/[^a-zA-Z0-9]/g, '').slice(-12);
    return `evo_${shortId}`;
  }

  private cleanPhone(phone: string): string {
    return phone.replace(/[^0-9]/g, '');
  }

  private mapEvolutionState(state: string): WaStatus {
    switch (state?.toLowerCase()) {
      case 'open':
        return 'CONNECTED';
      case 'connecting':
        return 'CONNECTING';
      default:
        return 'DISCONNECTED';
    }
  }
}
