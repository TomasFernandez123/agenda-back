import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Professional } from './schemas/professional.schema';
import { CreateProfessionalDto, UpdateProfessionalDto } from './dto/professional.dto';

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectModel(Professional.name) private professionalModel: Model<Professional>,
  ) {}

  async create(tenantId: string, dto: CreateProfessionalDto): Promise<Professional> {
    return this.professionalModel.create({
      tenantId: new Types.ObjectId(tenantId),
      userId: new Types.ObjectId(dto.userId),
      displayName: dto.displayName,
      rules: {
        minCancelMinutes: dto.minCancelMinutes ?? 60,
        minRescheduleMinutes: dto.minRescheduleMinutes ?? 60,
      },
      bookingSettings: {
        allowDeposit: dto.allowDeposit ?? false,
      },
    });
  }

  async findAll(tenantId: string): Promise<Professional[]> {
    return this.professionalModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .populate('userId', 'name email phone')
      .lean();
  }

  async findActiveByTenantId(tenantId: string): Promise<Professional[]> {
    return this.professionalModel
      .find({ tenantId: new Types.ObjectId(tenantId), isActive: true })
      .populate('userId', 'name email phone')
      .lean();
  }

  async findById(id: string): Promise<Professional> {
    const prof = await this.professionalModel.findById(id).populate('userId', 'name email phone').lean();
    if (!prof) throw new NotFoundException('Professional not found');
    return prof;
  }

  async update(id: string, dto: UpdateProfessionalDto): Promise<Professional> {
    const updateData: any = {};
    if (dto.displayName) updateData.displayName = dto.displayName;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.minCancelMinutes !== undefined) updateData['rules.minCancelMinutes'] = dto.minCancelMinutes;
    if (dto.minRescheduleMinutes !== undefined) updateData['rules.minRescheduleMinutes'] = dto.minRescheduleMinutes;
    if (dto.allowDeposit !== undefined) updateData['bookingSettings.allowDeposit'] = dto.allowDeposit;

    const prof = await this.professionalModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
      .lean();
    if (!prof) throw new NotFoundException('Professional not found');
    return prof;
  }
}
