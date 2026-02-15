import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditEvent, AuditAction } from './schemas/audit-event.schema';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectModel(AuditEvent.name) private auditModel: Model<AuditEvent>,
  ) {}

  async log(
    tenantId: Types.ObjectId | string,
    actorUserId: Types.ObjectId | string | null,
    action: AuditAction,
    entityType: string,
    entityId: Types.ObjectId | string,
    metadata?: Record<string, any>,
  ): Promise<void> {
    try {
      await this.auditModel.create({
        tenantId: new Types.ObjectId(tenantId),
        actorUserId: actorUserId ? new Types.ObjectId(actorUserId) : undefined,
        action,
        entityType,
        entityId: new Types.ObjectId(entityId),
        metadata,
      });
    } catch (error) {
      this.logger.error(`Failed to log audit event: ${error.message}`, error.stack);
    }
  }

  async findByTenant(tenantId: string, limit = 50, skip = 0) {
    return this.auditModel
      .find({ tenantId: new Types.ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async findByEntity(entityId: string) {
    return this.auditModel
      .find({ entityId: new Types.ObjectId(entityId) })
      .sort({ createdAt: -1 })
      .lean();
  }
}
