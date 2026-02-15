import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
  UpdateAppointmentNotesDto,
  QueryAppointmentsDto,
} from './dto/appointment.dto';
import { Roles, Role, CurrentUser, Public } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { AuthService } from '../auth/auth.service';

@Controller()
export class AppointmentsController {
  constructor(
    private readonly appointmentsService: AppointmentsService,
    private readonly authService: AuthService,
  ) {}

  @Post('appointments')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF, Role.CLIENT)
  create(@Body() dto: CreateAppointmentDto, @CurrentUser() user: any) {
    return this.appointmentsService.create(user.tenantId, dto, user.userId);
  }

  @Get('appointments')
  findAll(@Query() query: QueryAppointmentsDto, @CurrentUser() user: any) {
    return this.appointmentsService.findAll(user.tenantId, query);
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
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF, Role.CLIENT)
  confirm(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.confirm(id, user.userId);
  }

  @Post('appointments/:id/cancel')
  cancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.cancel(id, user.userId);
  }

  @Post('appointments/:id/reschedule')
  reschedule(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: RescheduleAppointmentDto,
    @CurrentUser() user: any,
  ) {
    return this.appointmentsService.reschedule(id, dto, user.tenantId, user.userId);
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
  async publicConfirm(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('token') token: string,
  ) {
    const payload = this.authService.verifyActionToken(token);
    if (payload.appointmentId !== id || payload.action !== 'confirm') {
      throw new Error('Invalid token');
    }
    return this.appointmentsService.confirm(id);
  }

  @Public()
  @Get('public/appointments/:id/cancel')
  async publicCancel(
    @Param('id', ParseObjectIdPipe) id: string,
    @Query('token') token: string,
  ) {
    const payload = this.authService.verifyActionToken(token);
    if (payload.appointmentId !== id || payload.action !== 'cancel') {
      throw new Error('Invalid token');
    }
    return this.appointmentsService.cancel(id);
  }
}
