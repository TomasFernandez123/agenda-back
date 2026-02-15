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

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectModel(Appointment.name) private appointmentModel: Model<Appointment>,
    @InjectConnection() private connection: Connection,
    private readonly availabilityService: AvailabilityService,
    private readonly servicesService: ServicesService,
    private readonly professionalsService: ProfessionalsService,
    private readonly auditService: AuditService,
  ) {}

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

      return appointment;
    } finally {
      await session.endSession();
    }
  }

  async findAll(
    tenantId: string,
    query: QueryAppointmentsDto,
  ): Promise<Appointment[]> {
    const filter: any = { tenantId: new Types.ObjectId(tenantId) };
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

    await this.auditService.log(
      appointment.tenantId.toString(),
      actorUserId || null,
      AuditAction.APPOINTMENT_CANCELLED,
      'Appointment',
      id,
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

    return this.findById(id);
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
    return appointment;
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
