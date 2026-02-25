import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { addMinutes, differenceInMinutes } from 'date-fns';
import {
  Appointment,
  AppointmentStatus,
  DepositStatus,
  AppointmentSource,
} from './schemas/appointment.schema';
import {
  CreateAppointmentDto,
  RescheduleAppointmentDto,
  QueryAppointmentsDto,
} from './dto/appointment.dto';
import { AvailabilityService } from '../availability/availability.service';
import { ServicesService } from '../services/services.service';
import { ProfessionalsService } from '../professionals/professionals.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../audit/schemas/audit-event.schema';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreatePublicAppointmentDto } from './dto/create-public-appointment.dto';
import { EventsGateway } from '../gateway/events.gateway';

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  private validateStartAtIsFuture(startAt: Date): void {
    if (Number.isNaN(startAt.getTime())) {
      throw new BadRequestException('Invalid appointment request');
    }
    if (startAt <= new Date()) {
      throw new BadRequestException('Appointment date must be in the future');
    }
  }

  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    @InjectConnection() private connection: Connection,
    private readonly availabilityService: AvailabilityService,
    private readonly servicesService: ServicesService,
    private readonly professionalsService: ProfessionalsService,
    private readonly auditService: AuditService,
    private readonly tenantsService: TenantsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async createPublicByTenantSlug(
    slug: string,
    dto: CreatePublicAppointmentDto,
  ): Promise<{
    appointmentId: string;
    status: AppointmentStatus;
    startAt: Date;
    professional: { _id: string; displayName: string };
    service: { _id: string; name: string; durationMinutes: number };
    client: { name: string; email: string; phone: string };
    message: string;
  }> {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundException('Requested resource was not found');
    }
    const tenantObjectId = (tenant as any)._id as Types.ObjectId;
    const tenantId = tenantObjectId.toString();

    const startAt = new Date(dto.startAt);
    this.validateStartAtIsFuture(startAt);

    const [service, professional] = await Promise.all([
      this.servicesService.findById(dto.serviceId),
      this.professionalsService.findById(dto.professionalId),
    ]);

    if (service.tenantId.toString() !== tenantId) {
      throw new NotFoundException('Requested resource was not found');
    }
    if (professional.tenantId.toString() !== tenantId) {
      throw new NotFoundException('Requested resource was not found');
    }

    const offersService = await this.professionalsService.offersService(
      dto.professionalId,
      dto.serviceId,
    );
    if (!offersService) {
      throw new BadRequestException(
        'El profesional seleccionado no ofrece ese servicio',
      );
    }

    const endAt = addMinutes(startAt, service.durationMinutes);
    const isAvailable = await this.availabilityService.isSlotAvailable(
      tenantId,
      dto.professionalId,
      startAt,
      endAt,
    );
    if (!isAvailable) {
      throw new ConflictException('Selected time slot is not available');
    }

    const client = await this.usersService.findOrCreateClientForTenant({
      tenantId,
      name: dto.guestName,
      email: dto.guestEmail,
      phone: dto.guestPhone,
    });
    const clientObjectId = (client as any)._id as Types.ObjectId;

    let depositStatus = DepositStatus.NOT_REQUIRED;
    if (service.deposit?.enabled) {
      depositStatus = DepositStatus.PENDING;
    }

    const session = await this.connection.startSession();
    try {
      let createdAppointmentId: string | null = null;

      await session.withTransaction(async () => {
        const overlap = await this.appointmentModel.findOne(
          {
            tenantId: tenantObjectId,
            professionalId: new Types.ObjectId(dto.professionalId),
            status: {
              $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
            },
            startAt: { $lt: endAt },
            endAt: { $gt: startAt },
          },
          null,
          { session },
        );

        if (overlap) {
          throw new ConflictException('Selected time slot is not available');
        }

        const [created] = await this.appointmentModel.create(
          [
            {
              tenantId: tenantObjectId,
              professionalId: new Types.ObjectId(dto.professionalId),
              serviceId: new Types.ObjectId(dto.serviceId),
              clientId: new Types.ObjectId(clientObjectId),
              startAt,
              endAt,
              status: AppointmentStatus.PENDING,
              notesInternal: dto.notesInternal,
              depositStatus,
              source: AppointmentSource.CLIENT,
            },
          ],
          { session },
        );

        createdAppointmentId = created._id.toString();
      });

      if (!createdAppointmentId) {
        throw new ConflictException('Could not process appointment request');
      }

      await this.notificationsService.scheduleReminders(
        tenantId,
        createdAppointmentId,
        startAt,
      );

      await this.notificationsService.sendAppointmentEventEmails(
        tenantId,
        createdAppointmentId,
        'REQUESTED',
      );

      void this.notificationsService.sendAppointmentEventWhatsApp(
        tenantId,
        createdAppointmentId,
        'REQUESTED',
      );

      await this.auditService.log(
        tenantId,
        null,
        AuditAction.APPOINTMENT_CREATED_PUBLIC,
        'Appointment',
        createdAppointmentId,
        {
          startAt,
          endAt,
          serviceId: dto.serviceId,
          professionalId: dto.professionalId,
          source: 'PUBLIC',
        },
      );

      this.eventsGateway.emitToTenant(tenantId, 'appointment:created', {
        appointmentId: createdAppointmentId,
        status: AppointmentStatus.PENDING,
        startAt,
        endAt,
        professionalId: dto.professionalId,
        serviceId: dto.serviceId,
      });

      return {
        appointmentId: createdAppointmentId,
        status: AppointmentStatus.PENDING,
        startAt,
        professional: {
          _id: (professional as any)._id.toString(),
          displayName: professional.displayName,
        },
        service: {
          _id: (service as any)._id.toString(),
          name: service.name,
          durationMinutes: service.durationMinutes,
        },
        client: {
          name: client.name,
          email: client.email,
          phone: client.phone,
        },
        message: 'Solicitud registrada correctamente',
      };
    } finally {
      await session.endSession();
    }
  }

  /**
   * Create appointment with transactional overlap prevention.
   */
  async create(
    tenantId: string,
    dto: CreateAppointmentDto,
    actorUserId?: string,
  ): Promise<Appointment> {
    // 1. Validate service exists and get duration
    const service = await this.servicesService.findById(dto.serviceId);
    const startAt = new Date(dto.startAt);
    this.validateStartAtIsFuture(startAt);
    const endAt = addMinutes(startAt, service.durationMinutes);

    // 2. Check professional availability
    const isAvailable = await this.availabilityService.isSlotAvailable(
      tenantId,
      dto.professionalId,
      startAt,
      endAt,
    );
    if (!isAvailable) {
      throw new BadRequestException(
        "The selected time slot is outside the professional's availability",
      );
    }

    // 3. Determine deposit status
    let depositStatus = DepositStatus.NOT_REQUIRED;
    if (service.deposit?.enabled) {
      depositStatus = DepositStatus.PENDING;
    }

    // 4. Transactional overlap check + create
    const session = await this.connection.startSession();
    try {
      let appointment: Appointment | null = null;
      await session.withTransaction(async () => {
        // Check for overlapping appointments
        const overlap = await this.appointmentModel.findOne(
          {
            tenantId: new Types.ObjectId(tenantId),
            professionalId: new Types.ObjectId(dto.professionalId),
            status: {
              $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
            },
            startAt: { $lt: endAt },
            endAt: { $gt: startAt },
          },
          null,
          { session },
        );

        if (overlap) {
          throw new ConflictException(
            `Time slot conflicts with an existing appointment (${overlap.startAt.toISOString()} - ${overlap.endAt.toISOString()})`,
          );
        }

        // Create appointment
        const [created] = await this.appointmentModel.create(
          [
            {
              tenantId: new Types.ObjectId(tenantId),
              professionalId: new Types.ObjectId(dto.professionalId),
              serviceId: new Types.ObjectId(dto.serviceId),
              clientId: new Types.ObjectId(dto.clientId),
              startAt,
              endAt,
              status: AppointmentStatus.PENDING,
              notesInternal: dto.notesInternal,
              depositStatus,
              source: dto.source || AppointmentSource.ADMIN,
            },
          ],
          { session },
        );
        appointment = created;
      });

      if (!appointment) {
        throw new ConflictException('Failed to create appointment');
      }

      // 5. Audit log (outside transaction)
      await this.auditService.log(
        tenantId,
        actorUserId || null,
        AuditAction.APPOINTMENT_CREATED,
        'Appointment',
        (appointment as any)._id.toString(),
        {
          startAt,
          endAt,
          serviceId: dto.serviceId,
          professionalId: dto.professionalId,
        },
      );

      await this.notificationsService.scheduleReminders(
        tenantId,
        (appointment as any)._id.toString(),
        startAt,
      );

      await this.notificationsService.sendAppointmentEventEmails(
        tenantId,
        (appointment as any)._id.toString(),
        'REQUESTED',
      );

      void this.notificationsService.sendAppointmentEventWhatsApp(
        tenantId,
        (appointment as any)._id.toString(),
        'REQUESTED',
      );

      this.eventsGateway.emitToTenant(tenantId, 'appointment:created', appointment);

      return appointment;
    } finally {
      await session.endSession();
    }
  }

  async findAll(
    tenantId: string,
    query: QueryAppointmentsDto,
    clientUserId?: string,
  ): Promise<Appointment[]> {
    const filter: any = { tenantId: new Types.ObjectId(tenantId) };
    if (clientUserId) {
      filter.clientId = new Types.ObjectId(clientUserId);
    }
    if (query.professionalId)
      filter.professionalId = new Types.ObjectId(query.professionalId);
    if (query.status) filter.status = query.status;
    if (query.from || query.to) {
      filter.startAt = {};
      if (query.from) filter.startAt.$gte = new Date(query.from);
      if (query.to) filter.startAt.$lte = new Date(query.to);
    }

    return this.appointmentModel
      .find(filter)
      .populate('professionalId', 'displayName')
      .populate('serviceId', 'name durationMinutes price')
      .populate('clientId', 'name email phone')
      .sort({ startAt: 1 })
      .lean();
  }

  async findById(id: string): Promise<Appointment> {
    const appointment = await this.appointmentModel
      .findById(id)
      .populate('professionalId', 'displayName')
      .populate('serviceId', 'name durationMinutes price')
      .populate('clientId', 'name email phone')
      .lean();
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }

  async confirm(id: string, actorUserId?: string): Promise<Appointment> {
    const appointment = await this.appointmentModel.findByIdAndUpdate(
      id,
      { $set: { status: AppointmentStatus.CONFIRMED } },
      { new: true },
    );
    if (!appointment) throw new NotFoundException('Appointment not found');

    await this.auditService.log(
      appointment.tenantId.toString(),
      actorUserId || null,
      AuditAction.APPOINTMENT_CONFIRMED,
      'Appointment',
      id,
    );

    await this.notificationsService.sendAppointmentEventEmails(
      appointment.tenantId.toString(),
      id,
      'CONFIRMED',
    );

    void this.notificationsService.sendAppointmentEventWhatsApp(
      appointment.tenantId.toString(),
      id,
      'CONFIRMED',
    );

    this.eventsGateway.emitToTenant(
      appointment.tenantId.toString(),
      'appointment:updated',
      appointment,
    );

    return appointment;
  }

  async cancel(id: string, actorUserId?: string): Promise<Appointment> {
    const appointment = await this.appointmentModel.findById(id);
    if (!appointment) throw new NotFoundException('Appointment not found');

    // Check min cancel minutes
    const professional = await this.professionalsService.findById(
      appointment.professionalId.toString(),
    );
    const minutesUntilStart = differenceInMinutes(
      appointment.startAt,
      new Date(),
    );
    if (minutesUntilStart < (professional as any).rules?.minCancelMinutes) {
      throw new BadRequestException(
        `Cannot cancel less than ${(professional as any).rules.minCancelMinutes} minutes before the appointment`,
      );
    }

    appointment.status = AppointmentStatus.CANCELLED;
    await appointment.save();

    await this.notificationsService.cancelReminders(id);

    await this.auditService.log(
      appointment.tenantId.toString(),
      actorUserId || null,
      AuditAction.APPOINTMENT_CANCELLED,
      'Appointment',
      id,
    );

    await this.notificationsService.sendAppointmentEventEmails(
      appointment.tenantId.toString(),
      id,
      'CANCELLED',
    );

    void this.notificationsService.sendAppointmentEventWhatsApp(
      appointment.tenantId.toString(),
      id,
      'CANCELLED',
    );

    this.eventsGateway.emitToTenant(
      appointment.tenantId.toString(),
      'appointment:updated',
      appointment,
    );

    return appointment;
  }

  async reschedule(
    id: string,
    dto: RescheduleAppointmentDto,
    tenantId: string,
    actorUserId?: string,
  ): Promise<Appointment> {
    const appointment = await this.appointmentModel.findById(id);
    if (!appointment) throw new NotFoundException('Appointment not found');

    // Check min reschedule minutes
    const professional = await this.professionalsService.findById(
      appointment.professionalId.toString(),
    );
    const minutesUntilStart = differenceInMinutes(
      appointment.startAt,
      new Date(),
    );
    if (minutesUntilStart < (professional as any).rules?.minRescheduleMinutes) {
      throw new BadRequestException(
        `Cannot reschedule less than ${(professional as any).rules.minRescheduleMinutes} minutes before the appointment`,
      );
    }

    const service = await this.servicesService.findById(
      appointment.serviceId.toString(),
    );
    const newStartAt = new Date(dto.startAt);
    this.validateStartAtIsFuture(newStartAt);
    const newEndAt = addMinutes(newStartAt, service.durationMinutes);

    // Check availability
    const isAvailable = await this.availabilityService.isSlotAvailable(
      tenantId,
      appointment.professionalId.toString(),
      newStartAt,
      newEndAt,
    );
    if (!isAvailable) {
      throw new BadRequestException(
        "The new time slot is outside the professional's availability",
      );
    }

    // Transactional overlap check
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const overlap = await this.appointmentModel.findOne(
          {
            _id: { $ne: new Types.ObjectId(id) },
            tenantId: new Types.ObjectId(tenantId),
            professionalId: appointment.professionalId,
            status: {
              $in: [AppointmentStatus.PENDING, AppointmentStatus.CONFIRMED],
            },
            startAt: { $lt: newEndAt },
            endAt: { $gt: newStartAt },
          },
          null,
          { session },
        );

        if (overlap) {
          throw new ConflictException(
            'New time slot conflicts with an existing appointment',
          );
        }

        await this.appointmentModel.findByIdAndUpdate(
          id,
          {
            $set: {
              startAt: newStartAt,
              endAt: newEndAt,
              status: AppointmentStatus.RESCHEDULED,
            },
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }

    await this.auditService.log(
      tenantId,
      actorUserId || null,
      AuditAction.APPOINTMENT_RESCHEDULED,
      'Appointment',
      id,
      { oldStartAt: appointment.startAt, newStartAt, newEndAt },
    );

    await this.notificationsService.sendAppointmentEventEmails(
      tenantId,
      id,
      'RESCHEDULED',
    );

    void this.notificationsService.sendAppointmentEventWhatsApp(
      tenantId,
      id,
      'RESCHEDULED',
    );

    const rescheduled = await this.findById(id);
    this.eventsGateway.emitToTenant(tenantId, 'appointment:updated', rescheduled);
    return rescheduled;
  }

  async markNoShow(id: string, actorUserId?: string): Promise<Appointment> {
    const appointment = await this.appointmentModel.findByIdAndUpdate(
      id,
      { $set: { status: AppointmentStatus.NO_SHOW } },
      { new: true },
    );
    if (!appointment) throw new NotFoundException('Appointment not found');

    await this.auditService.log(
      appointment.tenantId.toString(),
      actorUserId || null,
      AuditAction.APPOINTMENT_NO_SHOW,
      'Appointment',
      id,
    );

    this.eventsGateway.emitToTenant(
      appointment.tenantId.toString(),
      'appointment:updated',
      appointment,
    );

    return appointment;
  }

  async remove(
    id: string,
    actorUserId?: string,
  ): Promise<{ deleted: boolean; id: string }> {
    const appointment = await this.appointmentModel.findById(id);
    if (!appointment) throw new NotFoundException('Appointment not found');

    await this.notificationsService.cancelReminders(id);
    await this.appointmentModel.findByIdAndDelete(id);

    await this.auditService.log(
      appointment.tenantId.toString(),
      actorUserId || null,
      AuditAction.APPOINTMENT_CANCELLED,
      'Appointment',
      id,
      { hardDeleted: true, previousStatus: appointment.status },
    );

    this.eventsGateway.emitToTenant(
      appointment.tenantId.toString(),
      'appointment:deleted',
      { id },
    );

    return { deleted: true, id };
  }

  async updateNotes(id: string, notesInternal?: string): Promise<Appointment> {
    const appointment = await this.appointmentModel.findByIdAndUpdate(
      id,
      { $set: { notesInternal } },
      { new: true },
    );
    if (!appointment) throw new NotFoundException('Appointment not found');
    return appointment;
  }
}
