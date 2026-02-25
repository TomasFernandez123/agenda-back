import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Professional } from './schemas/professional.schema';
import { User } from '../users/schemas/user.schema';
import { CreateProfessionalDto, UpdateProfessionalDto } from './dto/professional.dto';

const POPULATE_SERVICES = { path: 'serviceIds', match: { isActive: true } };
const POPULATE_USER = { path: 'userId', select: 'name email phone' };

@Injectable()
export class ProfessionalsService {
  constructor(
    @InjectModel(Professional.name) private professionalModel: Model<Professional>,
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async create(tenantId: string, dto: CreateProfessionalDto): Promise<Professional> {
    return this.professionalModel.create({
      tenantId: new Types.ObjectId(tenantId),
      userId: new Types.ObjectId(dto.userId),
      displayName: dto.displayName,
      serviceIds: (dto.serviceIds ?? []).map((id) => new Types.ObjectId(id)),
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
      .populate(POPULATE_USER)
      .populate(POPULATE_SERVICES)
      .lean();
  }

  async findActiveByTenantId(tenantId: string): Promise<Professional[]> {
    return this.professionalModel
      .find({ tenantId: new Types.ObjectId(tenantId), isActive: true })
      .populate(POPULATE_USER)
      .populate(POPULATE_SERVICES)
      .lean();
  }

  async findById(id: string): Promise<Professional> {
    const prof = await this.professionalModel
      .findById(id)
      .populate(POPULATE_USER)
      .populate(POPULATE_SERVICES)
      .lean();
    if (!prof) throw new NotFoundException('Professional not found');
    return prof;
  }

  async update(id: string, dto: UpdateProfessionalDto): Promise<Professional> {
    const updateData: any = {};
    if (dto.displayName !== undefined) updateData.displayName = dto.displayName;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.minCancelMinutes !== undefined) updateData['rules.minCancelMinutes'] = dto.minCancelMinutes;
    if (dto.minRescheduleMinutes !== undefined) updateData['rules.minRescheduleMinutes'] = dto.minRescheduleMinutes;
    if (dto.allowDeposit !== undefined) updateData['bookingSettings.allowDeposit'] = dto.allowDeposit;
    if (dto.serviceIds !== undefined) {
      updateData.serviceIds = dto.serviceIds.map((id) => new Types.ObjectId(id));
    }

    const prof = await this.professionalModel
      .findByIdAndUpdate(id, { $set: updateData }, { new: true, runValidators: true })
      .populate(POPULATE_USER)
      .populate(POPULATE_SERVICES)
      .lean();
    if (!prof) throw new NotFoundException('Professional not found');
    return prof;
  }

  async addService(professionalId: string, serviceId: string): Promise<Professional> {
    const prof = await this.professionalModel
      .findByIdAndUpdate(
        professionalId,
        { $addToSet: { serviceIds: new Types.ObjectId(serviceId) } },
        { new: true },
      )
      .populate(POPULATE_USER)
      .populate(POPULATE_SERVICES)
      .lean();
    if (!prof) throw new NotFoundException('Professional not found');
    return prof;
  }

  async removeService(professionalId: string, serviceId: string): Promise<Professional> {
    const prof = await this.professionalModel
      .findByIdAndUpdate(
        professionalId,
        { $pull: { serviceIds: new Types.ObjectId(serviceId) } },
        { new: true },
      )
      .populate(POPULATE_USER)
      .populate(POPULATE_SERVICES)
      .lean();
    if (!prof) throw new NotFoundException('Professional not found');
    return prof;
  }

  async remove(id: string): Promise<{ message: string }> {
    const prof = await this.professionalModel.findByIdAndDelete(id).lean();
    if (!prof) throw new NotFoundException('Professional not found');
    await this.userModel.findByIdAndDelete(prof.userId);
    return { message: 'Professional and associated user deleted successfully' };
  }

  /**
   * Returns true if the professional has the given serviceId in their list.
   * Used for validation in public appointment booking.
   */
  async offersService(professionalId: string, serviceId: string): Promise<boolean> {
    const count = await this.professionalModel.countDocuments({
      _id: new Types.ObjectId(professionalId),
      serviceIds: new Types.ObjectId(serviceId),
    });
    return count > 0;
  }
}

