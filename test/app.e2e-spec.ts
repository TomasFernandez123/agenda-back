import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppointmentsController } from '../src/modules/appointments/appointments.controller';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';
import { AuthService } from '../src/modules/auth/auth.service';

describe('Public appointments endpoint (e2e)', () => {
  let app: INestApplication<App>;
  const appointmentsServiceMock = {
    createPublicByTenantSlug: jest.fn(async (_slug: string, dto: any) => ({
      appointmentId: '65f1aa111111111111111115',
      status: 'PENDING',
      startAt: dto.startAt,
      professional: { _id: dto.professionalId, displayName: 'Profesional Demo' },
      service: { _id: dto.serviceId, name: 'Corte', durationMinutes: 30 },
      client: {
        name: dto.guestName,
        email: dto.guestEmail,
        phone: dto.guestPhone,
      },
      message: 'Solicitud registrada correctamente',
    })),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: 60000,
            limit: 100,
          },
        ]),
      ],
      controllers: [AppointmentsController],
      providers: [
        { provide: AppointmentsService, useValue: appointmentsServiceMock },
        {
          provide: AuthService,
          useValue: { verifyActionToken: jest.fn() },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('creates public appointment (201)', () => {
    return request(app.getHttpServer())
      .post('/tenants/slug/demo/appointments/public')
      .send({
        professionalId: '65f1aa111111111111111112',
        serviceId: '65f1aa111111111111111113',
        startAt: '2099-01-01T10:00:00.000Z',
        guestName: 'Juan Perez',
        guestEmail: 'juan@mail.com',
        guestPhone: '+5491111111111',
      })
      .expect(201)
      .expect((res) => {
        expect(res.body.status).toBe('PENDING');
        expect(res.body.message).toBe('Solicitud registrada correctamente');
      });
  });

  it('rejects invalid payload (400)', () => {
    return request(app.getHttpServer())
      .post('/tenants/slug/demo/appointments/public')
      .send({
        professionalId: 'invalid-objectid',
        serviceId: '65f1aa111111111111111113',
        startAt: 'invalid-date',
        guestName: 'J',
        guestEmail: 'wrong-email',
        guestPhone: '12',
      })
      .expect(400);
  });

  it('applies strict endpoint rate limit (429)', async () => {
    const payload = {
      professionalId: '65f1aa111111111111111112',
      serviceId: '65f1aa111111111111111113',
      startAt: '2099-01-01T10:00:00.000Z',
      guestName: 'Juan Perez',
      guestEmail: 'juan@mail.com',
      guestPhone: '+5491111111111',
    };

    for (let i = 0; i < 5; i += 1) {
      await request(app.getHttpServer())
        .post('/tenants/slug/demo/appointments/public')
        .send(payload)
        .expect(201);
    }

    await request(app.getHttpServer())
      .post('/tenants/slug/demo/appointments/public')
      .send(payload)
      .expect(429);
  });
});
