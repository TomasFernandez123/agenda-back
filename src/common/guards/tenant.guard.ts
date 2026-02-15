import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Role } from '../decorators/roles.decorator';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return true; // Let auth guard handle
    }

    // Super admins can access any tenant
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    // For tenant-scoped users, ensure tenantId exists
    if (!user.tenantId) {
      throw new ForbiddenException('User is not associated with any tenant');
    }

    // Attach tenantId to request for easy access in services
    request.tenantId = user.tenantId;
    return true;
  }
}
