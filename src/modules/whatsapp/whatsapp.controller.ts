import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Param,
  Res,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators';
import { TenantsService } from '../tenants/tenants.service';
import { AppointmentsService } from '../appointments/appointments.service';
import { AuditService } from '../audit/audit.service';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';

@Controller('webhooks/whatsapp')
@Public()
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly appointmentsService: AppointmentsService,
    private readonly auditService: AuditService,
  ) {}

  @Get(':tenantId')
  async verify(
    @Param('tenantId', ParseObjectIdPipe) tenantId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const tenant = await this.tenantsService.findById(tenantId);

    if (
      mode === 'subscribe' &&
      verifyToken === tenant.whatsappConfig?.verifyToken
    ) {
      this.logger.log(`Webhook verified for tenant ${tenantId}`);
      return res.status(200).send(challenge);
    }

    return res.status(403).send('Forbidden');
  }

  @Post(':tenantId')
  @HttpCode(HttpStatus.OK)
  async inbound(
    @Param('tenantId', ParseObjectIdPipe) tenantId: string,
    @Body() body: any,
  ) {
    this.logger.log(`Inbound WhatsApp webhook for tenant ${tenantId}`);

    try {
      const entry = body?.entry?.[0];
      const changes = entry?.changes?.[0];
      const value = changes?.value;

      if (!value?.messages) return { status: 'ok' };

      for (const message of value.messages) {
        const from = message.from;
        const text =
          message.text?.body?.toUpperCase().trim() ||
          message.interactive?.button_reply?.id?.toUpperCase().trim();

        if (!text) continue;

        this.logger.log(`Received message from ${from}: ${text}`);

        if (text === 'CONFIRMAR' || text.startsWith('CONFIRM_')) {
          this.logger.log(`Confirmation request from ${from}`);
        } else if (text === 'CANCELAR' || text.startsWith('CANCEL_')) {
          this.logger.log(`Cancellation request from ${from}`);
        } else if (text.startsWith('REPROGRAMAR')) {
          const dateStr = text.replace('REPROGRAMAR', '').trim();
          this.logger.log(`Reschedule request from ${from} to ${dateStr}`);
        }
      }
    } catch (error) {
      this.logger.error(
        `Error processing inbound: ${(error as Error).message}`,
      );
    }

    return { status: 'ok' };
  }
}
