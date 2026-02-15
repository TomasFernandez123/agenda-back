import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { UserRole } from '../users/schemas/user.schema';
import { LoginDto } from './dto/login.dto';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    let tenantId: string | undefined;

    if (dto.tenantSlug) {
      const tenant = await this.tenantsService.findBySlug(dto.tenantSlug);
      if (!tenant) {
        throw new UnauthorizedException('Tenant not found');
      }
      tenantId = (tenant as any)._id.toString();
    }

    const user = await this.usersService.validateCredentials(
      dto.email,
      dto.password,
      tenantId,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Login sin tenant solo permitido para SUPER_ADMIN
    if (!dto.tenantSlug && user.role !== UserRole.SUPER_ADMIN) {
      throw new UnauthorizedException(
        'tenantSlug is required for non-SUPER_ADMIN users',
      );
    }

    const payload: TokenPayload = {
      sub: (user as any)._id.toString(),
      email: user.email,
      role: user.role,
      tenantId: user.tenantId?.toString(),
    };

    const accessOptions: JwtSignOptions = {
      secret: this.configService.get<string>('app.jwt.secret'),
      expiresIn:
        this.configService.get<number>('app.jwt.expirationSeconds') || 900,
    };

    const refreshOptions: JwtSignOptions = {
      secret: this.configService.get<string>('app.jwt.refreshSecret'),
      expiresIn:
        this.configService.get<number>('app.jwt.refreshExpirationSeconds') ||
        604800,
    };

    const accessToken = this.jwtService.sign(
      payload as any as Record<string, unknown>,
      accessOptions,
    );
    const refreshToken = this.jwtService.sign(
      payload as any as Record<string, unknown>,
      refreshOptions,
    );

    return { accessToken, refreshToken, user: { ...payload, name: user.name } };
  }

  async refresh(userPayload: TokenPayload) {
    const payloadObj = {
      sub: userPayload.sub,
      email: userPayload.email,
      role: userPayload.role,
      tenantId: userPayload.tenantId,
    };

    const accessToken = this.jwtService.sign(
      payloadObj as any as Record<string, unknown>,
      {
        secret: this.configService.get<string>('app.jwt.secret'),
        expiresIn:
          this.configService.get<number>('app.jwt.expirationSeconds') || 900,
      },
    );
    return { accessToken };
  }

  generateActionToken(
    appointmentId: string,
    action: string,
    expiresInSeconds = 259200,
  ): string {
    return this.jwtService.sign(
      { appointmentId, action, type: 'action' } as any as Record<
        string,
        unknown
      >,
      {
        secret: this.configService.get<string>('app.jwt.secret'),
        expiresIn: expiresInSeconds,
      },
    );
  }

  verifyActionToken(token: string): { appointmentId: string; action: string } {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('app.jwt.secret'),
      });
      if (payload.type !== 'action')
        throw new UnauthorizedException('Invalid token type');
      return { appointmentId: payload.appointmentId, action: payload.action };
    } catch {
      throw new UnauthorizedException('Invalid or expired action token');
    }
  }
}
