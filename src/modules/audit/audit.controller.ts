import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { QueryAuditDto } from './dto/query-audit.dto';
import { CurrentUser, Role, Roles } from '../../common/decorators';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  async findAll(@CurrentUser() user: any, @Query() query: QueryAuditDto) {
    const tenantId = this.resolveTenantId(user, query.tenantId);
    return this.auditService.findByTenantPaginated(tenantId, query);
  }

  @Get('export.csv')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="audit-events.csv"')
  async exportCsv(@CurrentUser() user: any, @Query() query: QueryAuditDto) {
    const tenantId = this.resolveTenantId(user, query.tenantId);
    return this.auditService.exportTenantAuditCsv(tenantId, query);
  }

  private resolveTenantId(user: any, tenantIdFromQuery?: string): string {
    if (user.role === Role.SUPER_ADMIN) {
      if (!tenantIdFromQuery) {
        throw new BadRequestException(
          'tenantId is required for SUPER_ADMIN audit queries',
        );
      }
      return tenantIdFromQuery;
    }

    return user.tenantId;
  }
}
