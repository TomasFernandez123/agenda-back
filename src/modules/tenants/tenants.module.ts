import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tenant, TenantSchema } from './schemas/tenant.schema';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { ProfessionalsModule } from '../professionals/professionals.module';
import { ServicesModule } from '../services/services.module';
import { AvailabilityModule } from '../availability/availability.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Tenant.name, schema: TenantSchema }]),
    ProfessionalsModule,
    ServicesModule,
    AvailabilityModule,
  ],
  controllers: [TenantsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
