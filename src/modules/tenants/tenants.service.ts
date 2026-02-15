import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Tenant } from './schemas/tenant.schema';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(@InjectModel(Tenant.name) private tenantModel: Model<Tenant>) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const existing = await this.tenantModel.findOne({ slug: dto.slug }).lean();
    if (existing) {
      throw new ConflictException(
        `Tenant with slug "${dto.slug}" already exists`,
      );
    }
    return this.tenantModel.create(dto);
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.tenantModel.findOne({ slug }).lean();
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantModel.find().lean();
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantModel.findById(id).lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.tenantModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .lean();
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }
}
