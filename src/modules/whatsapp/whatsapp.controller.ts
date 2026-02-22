import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Logger,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { Public } from '../../common/decorators';
import { WhatsappService } from './whatsapp.service';
import { AppointmentsService } from '../appointments/appointments.service';

interface JwtPayload {
  tenantId: string;
  sub: string;
}

interface AuthenticatedRequest extends ExpressRequest {
  user: JwtPayload;
}

// ─── Webhook payload shapes from Evolution API ──────────────────────────────

interface EvolutionMessageUpsert {
  event: 'messages.upsert';
  instance: string;
  data: {
    key: { remoteJid: string };
    message?: { conversation?: string };
  }[];
}

interface EvolutionConnectionUpdate {
  event: 'connection.update';
  instance: string;
  data: { state: string };
}

type EvolutionWebhookPayload =
  | EvolutionMessageUpsert
  | EvolutionConnectionUpdate;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * WhatsApp controller — two sections:
 *
 * 1. /whatsapp/* (JWT-protected) — instance management for the current tenant
 * 2. /webhooks/whatsapp (public)  — receives events from Evolution API
 */
@Controller()
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly whatsappService: WhatsappService,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  // ─── Instance management (JWT protected) ──────────────────────────────────

  /**
   * POST /whatsapp/instance
   * Creates a new Evolution instance for the authenticated tenant.
   * Should be called once during tenant onboarding.
   */
  @Post('whatsapp/instance')
  async createInstance(@Request() req: AuthenticatedRequest) {
    const { tenantId } = req.user;
    return this.whatsappService.createInstance(tenantId);
  }

  /**
   * GET /whatsapp/instance/qr
   * Returns the base64 QR code for WhatsApp scanning.
   */
  @Get('whatsapp/instance/qr')
  async getQr(@Request() req: AuthenticatedRequest) {
    const { tenantId } = req.user;
    return this.whatsappService.getQrCode(tenantId);
  }

  /**
   * GET /whatsapp/instance/status
   * Returns the current connection status of the instance.
   */
  @Get('whatsapp/instance/status')
  async getStatus(@Request() req: AuthenticatedRequest) {
    const { tenantId } = req.user;
    return this.whatsappService.getInstanceStatus(tenantId);
  }

  /**
   * DELETE /whatsapp/instance
   * Disconnects and removes the instance from Evolution API.
   */
  @Delete('whatsapp/instance')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteInstance(@Request() req: AuthenticatedRequest) {
    const { tenantId } = req.user;
    await this.whatsappService.deleteInstance(tenantId);
  }

  // ─── Webhook (public, called by Evolution API) ─────────────────────────────

  /**
   * POST /webhooks/whatsapp
   * Receives all events from Evolution API.
   * Evolution sends: connection.update, messages.upsert, etc.
   */
  @Post('webhooks/whatsapp')
  @Public()
  @HttpCode(HttpStatus.OK)
  async inbound(@Body() payload: EvolutionWebhookPayload) {
    const event = payload?.event;
    const instance = payload?.instance;

    this.logger.log(`Evolution webhook: event=${event} instance=${instance}`);

    try {
      if (event === 'connection.update') {
        const connectionPayload = payload;
        const state = connectionPayload.data?.state ?? 'close';
        await this.whatsappService.handleConnectionUpdate(instance, state);
        return { status: 'ok' };
      }

      if (event === 'messages.upsert') {
        const msgPayload = payload;
        this.handleInboundMessages(instance, msgPayload.data ?? []);
        return { status: 'ok' };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Error processing webhook event=${event}: ${msg}`);
    }

    return { status: 'ok' };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private handleInboundMessages(
    instance: string,
    messages: EvolutionMessageUpsert['data'],
  ): void {
    for (const msg of messages) {
      const from = msg.key?.remoteJid?.replace('@s.whatsapp.net', '') ?? '';
      const text = msg.message?.conversation?.toUpperCase().trim() ?? '';

      if (!text || !from) continue;

      this.logger.log(`[${instance}] Inbound from ${from}: ${text}`);

      if (text === 'CONFIRMAR' || text.startsWith('CONFIRM_')) {
        this.logger.log(`Confirmation intent from ${from}`);
        // TODO: lookup appointment by phone + instance → confirm it
      } else if (text === 'CANCELAR' || text.startsWith('CANCEL_')) {
        this.logger.log(`Cancellation intent from ${from}`);
        // TODO: lookup appointment by phone + instance → cancel it
      } else if (text.startsWith('REPROGRAMAR')) {
        const dateStr = text.replace('REPROGRAMAR', '').trim();
        this.logger.log(`Reschedule intent from ${from} → ${dateStr}`);
        // TODO: lookup appointment → reschedule
      }
    }
  }
}
