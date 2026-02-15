import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Service } from './schemas/service.schema';
import { CreateServiceDto, UpdateServiceDto } from './dto/service.dto';

@Injectable()
export class ServicesService {
  constructor(@InjectModel(Service.name) private serviceModel: Model<Service>) {}

  async create(tenantId: string, dto: CreateServiceDto): Promise<Service> {
    return this.serviceModel.create({
      tenantId: new Types.ObjectId(tenantId),
      name: dto.name,
      durationMinutes: dto.durationMinutes,
      price: dto.price,
      deposit: {
        enabled: dto.depositEnabled ?? false,
        amount: dto.depositAmount,
        percentage: dto.depositPercentage,
        required: dto.depositRequired ?? false,
      },
    });
  }

  async findAll(tenantId: string): Promise<Service[]> {
    return this.serviceModel.find({ tenantId: new Types.ObjectId(tenantId), isActive: true }).lean();
  }

  async findById(id: string): Promise<Service> {
    const service = await this.serviceModel.findById(id).lean();
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }

  async update(id: string, dto: UpdateServiceDto): Promise<Service> {
    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.durationMinutes) updateData.durationMinutes = dto.durationMinutes;
    if (dto.price !== undefined) updateData.price = dto.price;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.depositEnabled !== undefined) updateData['deposit.enabled'] = dto.depositEnabled;
    if (dto.depositAmount !== undefined) updateData['deposit.amount'] = dto.depositAmount;
    if (dto.depositPercentage !== undefined) updateData['deposit.percentage'] = dto.depositPercentage;
    if (dto.depositRequired !== undefined) updateData['deposit.required'] = dto.depositRequired;

    const service = await this.serviceModel.findByIdAndUpdate(id, { $set: updateData }, { new: true }).lean();
    if (!service) throw new NotFoundException('Service not found');
    return service;
  }
}
