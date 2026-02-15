import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Professional, ProfessionalSchema } from './schemas/professional.schema';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalsController } from './professionals.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Professional.name, schema: ProfessionalSchema }]),
  ],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService],
  exports: [ProfessionalsService],
})
export class ProfessionalsModule {}
