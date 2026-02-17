import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { AppointmentStatus } from './schemas/appointment.schema';

describe('AppointmentsService public booking', () => {
  const tenantId = '65f1aa111111111111111111';
  const professionalId = '65f1aa111111111111111112';
  const serviceId = '65f1aa111111111111111113';
  const clientId = '65f1aa111111111111111114';

  const tenant = { _id: tenantId, slug: 'demo-tenant' } as any;
  const service = {
    _id: serviceId,
    tenantId,
    name: 'Corte',
    durationMinutes: 30,
    deposit: { enabled: false },
  } as any;
  const professional = {
    _id: professionalId,
    tenantId,
    displayName: 'Profesional Demo',
  } as any;

  const dto = {
    professionalId,
    serviceId,
    startAt: '2099-01-01T10:00:00.000Z',
    guestName: 'Juan Perez',
    guestEmail: 'juan@mail.com',
    guestPhone: '+5491111111111',
  } as any;

  const appointmentModel = {
    findOne: jest.fn(),
    create: jest.fn(),
  } as any;

  const session = {
    withTransaction: jest.fn(async (cb: () => Promise<void>) => cb()),
    endSession: jest.fn(),
  } as any;

  const connection = {
    startSession: jest.fn(async () => session),
  } as any;

  const availabilityService = {
    isSlotAvailable: jest.fn(async () => true),
  } as any;

  const servicesService = {
    findById: jest.fn(async () => service),
  } as any;

  const professionalsService = {
    findById: jest.fn(async () => professional),
  } as any;

  const auditService = { log: jest.fn(async () => undefined) } as any;
  const tenantsService = { findBySlug: jest.fn(async () => tenant) } as any;
  const usersService = {
    findOrCreateClientForTenant: jest.fn(async () => ({
      _id: clientId,
      name: 'Juan Perez',
      email: 'juan@mail.com',
      phone: '+5491111111111',
    })),
  } as any;
  const notificationsService = {
    scheduleReminders: jest.fn(async () => undefined),
  } as any;

  let serviceInstance: AppointmentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    appointmentModel.findOne.mockResolvedValue(null);
    appointmentModel.create.mockResolvedValue([{ _id: '65f1aa111111111111111115' }]);

    serviceInstance = new AppointmentsService(
      appointmentModel,
      connection,
      availabilityService,
      servicesService,
      professionalsService,
      auditService,
      tenantsService,
      usersService,
      notificationsService,
    );
  });

  it('creates a valid public appointment', async () => {
    const result = await serviceInstance.createPublicByTenantSlug('demo-tenant', dto);

    expect(result.status).toBe(AppointmentStatus.PENDING);
    expect(result.appointmentId).toBe('65f1aa111111111111111115');
    expect(result.professional.displayName).toBe('Profesional Demo');
    expect(notificationsService.scheduleReminders).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalledTimes(1);
  });

  it('rejects when tenant does not exist', async () => {
    tenantsService.findBySlug.mockResolvedValueOnce(null);

    await expect(
      serviceInstance.createPublicByTenantSlug('missing', dto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects when requested slot is already occupied', async () => {
    appointmentModel.findOne.mockResolvedValueOnce({ _id: 'existing' });

    await expect(
      serviceInstance.createPublicByTenantSlug('demo-tenant', dto),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects resources from a different tenant', async () => {
    servicesService.findById.mockResolvedValueOnce({ ...service, tenantId: '65f1aa111111111111111999' });

    await expect(
      serviceInstance.createPublicByTenantSlug('demo-tenant', dto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects appointments with past date', async () => {
    await expect(
      serviceInstance.createPublicByTenantSlug('demo-tenant', {
        ...dto,
        startAt: '2020-01-01T10:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
