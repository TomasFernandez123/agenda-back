import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { TenantsModule } from '../tenants/tenants.module';

@Module({
  imports: [ConfigModule, TenantsModule],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
