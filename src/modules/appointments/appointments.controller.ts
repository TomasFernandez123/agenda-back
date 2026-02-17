import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
  Res,
  Req,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
  UpdateAppointmentNotesDto,
  QueryAppointmentsDto,
} from './dto/appointment.dto';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';
import { Roles, Role, CurrentUser, Public } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { AuthService } from '../auth/auth.service';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('appointments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF, Role.CLIENT)
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: any) {
    return this.appointmentsService.create(user.tenantId, dto, user.userId);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('tenants/slug/:slug/appointments/public')
  createPublicByTenantSlug(
    @Param('slug') slug: string,
    @Body() dto: CreatePublicAppointmentDto,
  ) {
    return this.appointmentsService.createPublicByTenantSlug(slug, dto);
  }

  @Get('appointments')
  findAll(@Query() query: QueryAppointmentsDto, @CurrentUser() user: any) {
    const clientUserId = user.role === Role.CLIENT ? user.userId : undefined;
    return this.appointmentsService.findAll(user.tenantId, query, clientUserId);
  }

  @Get('appointments/:id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.appointmentsService.findById(id);
  }

  @Patch('appointments/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  updateNotes(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateAppointmentNotesDto,
  ) {
    return this.appointmentsService.updateNotes(id, dto.notesInternal);
  }

  @Post('appointments/:id/confirm')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  confirm(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.confirm(id, user.userId);
  }

  @Post('appointments/:id/cancel')
  cancel(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: any) {
    return this.appointmentsService.cancel(id, user.userId);
  }

  @Delete('appointments/:id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: any) {
    return this.appointmentsService.remove(id, user.userId);
  }

  @Post('appointments/:id/reschedule')
  reschedule(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.reschedule(
      id,
      dto,
      user.tenantId,
      user.userId,
    );
  }

  @Post('appointments/:id/mark-no-show')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  markNoShow(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.markNoShow(id, user.userId);
  }

  // ===== Public endpoints with signed tokens =====

  @Public()
  @Get('public/appointments/:id/confirm')
  publicConfirm(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('token') token: string,
  ) {
    this.authService.verifyActionToken(token);
    throw new ForbiddenException('Client confirmation is disabled');
  }

  @Public()
  @Get('public/appointments/:id/cancel')
  publicCancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const payload = this.authService.verifyActionToken(token);
    if (payload.appointmentId !== id || payload.action !== 'cancel') {
      throw new Error('Invalid token');
    }

    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/html')) {
      const frontendBaseUrl = this.getFrontendBaseUrl();
      return res.redirect(
        302,
        `${frontendBaseUrl}/public/appointments/${id}/cancel?token=${encodeURIComponent(token)}`,
      );
    }

    return this.appointmentsService.cancel(id);
  }

  @Public()
  @Post('public/appointments/:id/reschedule')
  async publicReschedule(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('token') token: string,
    @Body() dto: RescheduleAppointmentDto,
  ) {
    const payload = this.authService.verifyActionToken(token);
    if (payload.appointmentId !== id || payload.action !== 'reschedule') {
      throw new Error('Invalid token');
    }

    const appointment = await this.appointmentsService.findById(id);
    const tenantId = appointment.tenantId.toString();
    return this.appointmentsService.reschedule(id, dto, tenantId);
  }

  private getFrontendBaseUrl(): string {
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
}
