import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { AvailabilityModule } from '../availability/availability.module';
import { ServicesModule } from '../services/services.module';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { GatewayModule } from '../gateway/gateway.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Appointment.name, schema: AppointmentSchema }]),
    AvailabilityModule,
    ServicesModule,
    ProfessionalsModule,
    AuditModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    NotificationsModule,
    GatewayModule,
  ],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
