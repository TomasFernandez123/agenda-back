import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditEvent, AuditAction } from './schemas/audit-event.schema';
import { QueryAuditDto } from './dto/query-audit.dto';

type AuditDateRangeFilter = {
  $gte?: Date;
  $lte?: Date;
};

type AuditTenantFilter = {
  tenantId: Types.ObjectId;
  action?: AuditAction;
  entityType?: string;
  entityId?: Types.ObjectId;
  actorUserId?: Types.ObjectId;
  createdAt?: AuditDateRangeFilter;
};

type PopulatedActor = {
  _id?: Types.ObjectId;
  name?: string;
  email?: string;
  role?: string;
};

type AuditCsvRow = {
  createdAt?: Date;
  action?: string;
  entityType?: string;
  entityId?: Types.ObjectId;
  actorUserId?: Types.ObjectId | PopulatedActor;
  metadata?: Record<string, unknown>;
};

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
    metadata?: Record<string, unknown>,
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
    } catch (error: unknown) {
      const appError = error as Error;
      this.logger.error(
        `Failed to log audit event: ${appError.message}`,
        appError.stack,
      );
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

  async findByTenantPaginated(tenantId: string, query: QueryAuditDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const filter = this.buildTenantFilter(tenantId, query);

    const [items, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('actorUserId', 'name email role')
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async exportTenantAuditCsv(
    tenantId: string,
    query: QueryAuditDto,
  ): Promise<string> {
    const filter = this.buildTenantFilter(tenantId, query);
    const rows = await this.auditModel
      .find(filter)
      .sort({ createdAt: -1 })
      .populate('actorUserId', 'name email role')
      .lean<AuditCsvRow[]>();

    const header = [
      'createdAt',
      'action',
      'entityType',
      'entityId',
      'actorUserId',
      'actorName',
      'actorEmail',
      'metadata',
    ];

    const lines = rows.map((row) => {
      const actor = this.extractActor(row.actorUserId);
      return [
        row.createdAt ? new Date(row.createdAt).toISOString() : '',
        row.action || '',
        row.entityType || '',
        row.entityId ? row.entityId.toString() : '',
        actor?._id ? actor._id.toString() : '',
        actor?.name || '',
        actor?.email || '',
        row.metadata ? JSON.stringify(row.metadata) : '',
      ]
        .map((value) => this.escapeCsv(value))
        .join(',');
    });

    return [header.join(','), ...lines].join('\n');
  }

  async findByEntity(entityId: string) {
    return this.auditModel
      .find({ entityId: new Types.ObjectId(entityId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  private buildTenantFilter(
    tenantId: string,
    query: QueryAuditDto,
  ): AuditTenantFilter {
    if (!Types.ObjectId.isValid(tenantId)) {
      throw new BadRequestException('Invalid tenantId');
    }

    const filter: AuditTenantFilter = {
      tenantId: new Types.ObjectId(tenantId),
    };

    if (query.action) {
      filter.action = query.action;
    }

    if (query.entityType) {
      filter.entityType = query.entityType;
    }

    if (query.entityId) {
      if (!Types.ObjectId.isValid(query.entityId)) {
        throw new BadRequestException('Invalid entityId');
      }
      filter.entityId = new Types.ObjectId(query.entityId);
    }

    if (query.actorUserId) {
      if (!Types.ObjectId.isValid(query.actorUserId)) {
        throw new BadRequestException('Invalid actorUserId');
      }
      filter.actorUserId = new Types.ObjectId(query.actorUserId);
    }

    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) {
        filter.createdAt.$gte = new Date(query.from);
      }
      if (query.to) {
        filter.createdAt.$lte = new Date(query.to);
      }
    }

    return filter;
  }

  private extractActor(
    actor: Types.ObjectId | PopulatedActor | undefined,
  ): PopulatedActor {
    if (!actor || actor instanceof Types.ObjectId) {
      return {};
    }
    return actor;
  }

  private escapeCsv(value: unknown): string {
    const normalized = this.stringifyCsvValue(value);
    const escaped = normalized.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  private stringifyCsvValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      return String(value);
    }

    return JSON.stringify(value);
  }
}
