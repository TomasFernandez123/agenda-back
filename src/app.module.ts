import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bull';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { appConfig, validationSchema } from './config';

// Guards
import { JwtAuthGuard, RolesGuard, TenantGuard } from './common/guards';

// Modules
import { AuthModule } from './modules/auth/auth.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { UsersModule } from './modules/users/users.module';
import { ProfessionalsModule } from './modules/professionals/professionals.module';
import { ServicesModule } from './modules/services/services.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { GatewayModule } from './modules/gateway/gateway.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
      validationSchema,
      envFilePath:
        process.env.NODE_ENV === 'production'
          ? ['.env.production', '.env']
          : ['.env.development', '.env'],
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('app.mongodb.uri'),
      }),
    }),

    // Redis / BullMQ
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisTlsEnabled = configService.get<boolean>('app.redis.tls');

        return {
          redis: {
            host: configService.get<string>('app.redis.host'),
            port: configService.get<number>('app.redis.port'),
            username: configService.get<string>('app.redis.username'),
            password: configService.get<string>('app.redis.password'),
            ...(redisTlsEnabled ? { tls: {} } : {}),
          },
        };
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Feature modules
    AuthModule,
    TenantsModule,
    UsersModule,
    ProfessionalsModule,
    ServicesModule,
    AvailabilityModule,
    AppointmentsModule,
    NotificationsModule,
    WhatsappModule,
    AuditModule,
    HealthModule,
  ],
  providers: [
    // Global guards (order matters: auth → roles → tenant)
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
