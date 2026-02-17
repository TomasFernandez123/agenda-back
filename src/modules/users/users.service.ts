import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserRole } from './schemas/user.schema';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
} from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone?: string): string | undefined {
    if (!phone) return undefined;
    const trimmed = phone.trim();
    const hasPlus = trimmed.startsWith('+');
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) return undefined;
    return `${hasPlus ? '+' : ''}${digits}`;
  }

  async create(tenantId: string, dto: CreateUserDto): Promise<User> {
    const tenantObjId = new Types.ObjectId(tenantId);
    const existing = await this.userModel
      .findOne({
        tenantId: tenantObjId,
        email: dto.email,
      })
      .lean();
    if (existing) {
      throw new ConflictException(
        'User with this email already exists in this tenant',
      );
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.userModel.create({
      tenantId: tenantObjId,
      role: dto.role,
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
    });
  }

  async createSuperAdmin(dto: CreateUserDto): Promise<User> {
    const existing = await this.userModel
      .findOne({ email: dto.email, role: UserRole.SUPER_ADMIN })
      .lean();
    if (existing) {
      throw new ConflictException('SuperAdmin with this email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    return this.userModel.create({
      role: UserRole.SUPER_ADMIN,
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
    });
  }

  async findAll(tenantId: string): Promise<User[]> {
    return this.userModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .select('-passwordHash')
      .lean();
  }

  async findById(id: string): Promise<User> {
    const user = await this.userModel
      .findById(id)
      .select('-passwordHash')
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByEmail(email: string, tenantId?: string): Promise<User | null> {
    const query: any = { email: this.normalizeEmail(email) };
    if (tenantId) query.tenantId = new Types.ObjectId(tenantId);
    return this.userModel.findOne(query).lean();
  }

  async findByEmailGlobal(email: string): Promise<User | null> {
    return this.userModel.findOne({ email: this.normalizeEmail(email) }).lean();
  }

  async findOrCreateClientForTenant(params: {
    tenantId: string;
    name: string;
    email: string;
    phone: string;
  }): Promise<User> {
    const normalizedEmail = this.normalizeEmail(params.email);
    const normalizedPhone = this.normalizePhone(params.phone);

    const existingClient = await this.userModel
      .findOne({
        tenantId: new Types.ObjectId(params.tenantId),
        email: normalizedEmail,
      })
      .lean();

    if (existingClient) {
      if (existingClient.role !== UserRole.CLIENT) {
        throw new ConflictException('Could not process appointment request');
      }

      const shouldUpdate =
        existingClient.name !== params.name ||
        (normalizedPhone && existingClient.phone !== normalizedPhone);

      if (shouldUpdate) {
        const updated = await this.userModel
          .findByIdAndUpdate(
            existingClient._id,
            {
              $set: {
                name: params.name,
                ...(normalizedPhone ? { phone: normalizedPhone } : {}),
              },
            },
            { new: true, runValidators: true },
          )
          .lean();

        if (updated) {
          return updated;
        }
      }

      return existingClient;
    }

    const randomSecret = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash(randomSecret, 12);

    return this.userModel.create({
      tenantId: new Types.ObjectId(params.tenantId),
      role: UserRole.CLIENT,
      email: normalizedEmail,
      passwordHash,
      name: params.name,
      phone: normalizedPhone,
      isActive: true,
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.userModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true, runValidators: true })
      .select('-passwordHash')
      .lean();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async changePassword(id: string, dto: ChangePasswordDto): Promise<void> {
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const result = await this.userModel.findByIdAndUpdate(id, { passwordHash });
    if (!result) throw new NotFoundException('User not found');
  }

  async validateCredentials(
    email: string,
    password: string,
    tenantId?: string,
  ): Promise<User | null> {
    const query: any = { email, isActive: true };
    if (tenantId) query.tenantId = new Types.ObjectId(tenantId);
    const user = await this.userModel.findOne(query).lean();
    if (!user) return null;
    const isValid = await bcrypt.compare(password, user.passwordHash);
    return isValid ? user : null;
  }
}
