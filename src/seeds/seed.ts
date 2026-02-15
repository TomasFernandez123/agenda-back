import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { UsersService } from '../modules/users/users.service';
import { UserRole } from '../modules/users/schemas/user.schema';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

async function seed() {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule);

  const usersService = app.get(UsersService);
  const configService = app.get(ConfigService);

  const email =
    configService.get<string>('app.superadmin.email') || 'admin@agenda.com';
  const password =
    configService.get<string>('app.superadmin.password') || 'Admin123!';

  try {
    const existing = await usersService.findByEmailGlobal(email);
    if (existing) {
      logger.log(`SuperAdmin "${email}" already exists, skipping`);
    } else {
      await usersService.createSuperAdmin({
        role: UserRole.SUPER_ADMIN,
        email,
        password,
        name: 'Super Admin',
      });
      logger.log(`✅ SuperAdmin created: ${email}`);
    }
  } catch (error) {
    logger.error(`Seed failed: ${(error as Error).message}`);
  }

  await app.close();
}

seed();
