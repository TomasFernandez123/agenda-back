import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { TenantsService } from '../tenants/tenants.service';
import { UserRole } from '../users/schemas/user.schema';
import { EmailConfig, Tenant } from '../tenants/schemas/tenant.schema';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as nodemailer from 'nodemailer';
import { createHash } from 'crypto';

export interface TokenPayload {
  sub: string;
  email: string;
  role: string;
  tenantId?: string;
}

interface ResetPasswordTokenPayload {
  sub: string;
  tenantId: string;
  purpose: 'reset_password';
  version: number;
}

type DocWithId = { _id: { toString(): string } };

interface ActionTokenPayload {
  appointmentId: string;
  action: string;
  type: 'action';
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly tenantsService: TenantsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const genericResponse = {
      message: 'Si el email existe, te enviamos un link.',
    };

    const tenant = await this.tenantsService.findBySlug(dto.tenantSlug);
    if (!tenant) {
      return genericResponse;
    }

    const tenantId = (tenant as Tenant & DocWithId)._id.toString();
    const user = await this.usersService.findByEmail(dto.email, tenantId);

    if (!user || !user.isActive) {
      return genericResponse;
    }

    const resetSecret = this.getResetPasswordSecret();
    const resetExpirationSeconds = this.getResetPasswordExpirationSeconds();

    const resetToken = this.jwtService.sign(
      {
        sub: (user as unknown as DocWithId)._id.toString(),
        tenantId,
        purpose: 'reset_password',
        version: user.resetPasswordVersion || 0,
      } as ResetPasswordTokenPayload,
      {
        secret: resetSecret,
        expiresIn: resetExpirationSeconds,
      },
    );

    const decoded = this.jwtService.decode(resetToken) as
      | (ResetPasswordTokenPayload & { iat?: number; exp?: number })
      | null;

    this.logger.log(
      `ForgotPassword token issued userId=${(user as unknown as DocWithId)._id.toString()} tenantId=${tenantId} version=${user.resetPasswordVersion || 0} expSeconds=${resetExpirationSeconds} secretFingerprint=${this.getSecretFingerprint(resetSecret)} iat=${decoded?.iat || 'N/A'} exp=${decoded?.exp || 'N/A'}`,
    );

    const resetUrl = `${this.getFrontendBaseUrl()}/t/${tenant.slug}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;

    await this.sendResetPasswordEmail({
      tenantId,
      to: user.email,
      tenantName: tenant.name,
      resetUrl,
    });

    return genericResponse;
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const rawToken = dto.token?.trim();
    const decoded = this.jwtService.decode(rawToken) as
      | (Partial<ResetPasswordTokenPayload> & { iat?: number; exp?: number })
      | null;

    this.logger.log(
      `ResetPassword attempt sub=${decoded?.sub || 'N/A'} tenantId=${decoded?.tenantId || 'N/A'} purpose=${decoded?.purpose || 'N/A'} version=${decoded?.version ?? 'N/A'} iat=${decoded?.iat || 'N/A'} exp=${decoded?.exp || 'N/A'} now=${Math.floor(Date.now() / 1000)}`,
    );

    const payload = this.verifyResetPasswordToken(rawToken);

    const user = await this.usersService.findByIdRaw(payload.sub);
    if (!user || !user.isActive) {
      this.logger.warn(
        `ResetPassword rejected: user missing/inactive sub=${payload.sub}`,
      );
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    if ((user.tenantId?.toString() || '') !== payload.tenantId) {
      this.logger.warn(
        `ResetPassword rejected: tenant mismatch userTenant=${user.tenantId?.toString() || 'N/A'} tokenTenant=${payload.tenantId} sub=${payload.sub}`,
      );
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const currentVersion = user.resetPasswordVersion || 0;
    if (currentVersion !== payload.version) {
      this.logger.warn(
        `ResetPassword rejected: version mismatch current=${currentVersion} token=${payload.version} sub=${payload.sub}`,
      );
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    const updated = await this.usersService.resetPasswordWithVersion(
      payload.sub,
      dto.newPassword,
      payload.version,
    );

    if (!updated) {
      this.logger.warn(
        `ResetPassword rejected: atomic update failed sub=${payload.sub} expectedVersion=${payload.version}`,
      );
      throw new UnauthorizedException('Invalid or expired reset token');
    }

    this.logger.log(
      `ResetPassword success sub=${payload.sub} tenantId=${payload.tenantId} newVersion=${payload.version + 1}`,
    );

    return { message: 'Password updated successfully' };
  }

  async login(dto: LoginDto) {
    let tenantId: string | undefined;

    if (dto.tenantSlug) {
      const tenant = await this.tenantsService.findBySlug(dto.tenantSlug);
      if (!tenant) {
        throw new UnauthorizedException('Tenant not found');
      }
      tenantId = (tenant as Tenant & DocWithId)._id.toString();
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
      sub: (user as unknown as DocWithId)._id.toString(),
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
      }) as ActionTokenPayload;
      if (payload.type !== 'action')
        throw new UnauthorizedException('Invalid token type');
      return { appointmentId: payload.appointmentId, action: payload.action };
    } catch {
      throw new UnauthorizedException('Invalid or expired action token');
    }
  }

  private verifyResetPasswordToken(token: string): ResetPasswordTokenPayload {
    try {
      const resetSecret = this.getResetPasswordSecret();
      this.logger.log(
        `ResetPassword verifying token with secretFingerprint=${this.getSecretFingerprint(resetSecret)}`,
      );

      const payload = this.jwtService.verify(token, {
        secret: resetSecret,
      }) as ResetPasswordTokenPayload;

      if (
        payload?.purpose !== 'reset_password' ||
        !payload?.sub ||
        !payload?.tenantId ||
        typeof payload?.version !== 'number'
      ) {
        throw new UnauthorizedException('Invalid reset token');
      }

      return payload;
    } catch (error) {
      this.logger.warn(
        `ResetPassword verify failed reason=${(error as Error).message}`,
      );
      throw new UnauthorizedException('Invalid or expired reset token');
    }
  }

  private getSecretFingerprint(secret: string): string {
    return createHash('sha256').update(secret).digest('hex').slice(0, 10);
  }

  private getResetPasswordSecret(): string {
    return (
      this.configService.get<string>('app.jwt.resetSecret') ||
      this.configService.get<string>('app.jwt.secret') ||
      'dev-jwt-secret'
    );
  }

  private getResetPasswordExpirationSeconds(): number {
    return (
      this.configService.get<number>('app.passwordReset.expirationSeconds') ||
      1800
    );
  }

  private getFrontendBaseUrl(): string {
    const baseUrl =
      this.configService.get<string>('app.frontendBaseUrl') ||
      this.configService.get<string>('app.corsOrigin') ||
      'http://localhost:4200';

    return baseUrl.replace(/\/$/, '');
  }

  private async sendResetPasswordEmail(params: {
    tenantId: string;
    to: string;
    tenantName: string;
    resetUrl: string;
  }): Promise<void> {
    try {
      const tenant = await this.tenantsService.findById(params.tenantId);
      const emailConfig = tenant.emailConfig as EmailConfig | undefined;

      if (!emailConfig?.host) {
        this.logger.warn(
          `No email config for tenant ${params.tenantId}; reset email skipped`,
        );
        return;
      }

      const transporter = nodemailer.createTransport({
        host: emailConfig.host,
        port: emailConfig.port || 587,
        secure: emailConfig.secure || false,
        auth: {
          user: emailConfig.user,
          pass: emailConfig.pass,
        },
      });

      await transporter.sendMail({
        from: emailConfig.from || emailConfig.user,
        to: params.to,
        subject: 'Recuperación de contraseña',
        text: `Hola.\n\nRecibimos una solicitud para restablecer tu contraseña de ${params.tenantName}.\n\nUsá este link para continuar: ${params.resetUrl}\n\nEste link vence pronto y solo puede usarse una vez. Si no hiciste esta solicitud, ignorá este mensaje.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
            <h2 style="margin-bottom: 12px;">Recuperación de contraseña</h2>
            <p>Recibimos una solicitud para restablecer tu contraseña de <strong>${params.tenantName}</strong>.</p>
            <p>
              <a href="${params.resetUrl}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 14px;border-radius:8px;font-weight:700;">
                Restablecer contraseña
              </a>
            </p>
            <p>Este link vence pronto y solo puede usarse una vez.</p>
            <p>Si no hiciste esta solicitud, ignorá este mensaje.</p>
          </div>
        `,
      });
    } catch (error) {
      this.logger.error(
        `Failed to send reset password email to ${params.to}: ${(error as Error).message}`,
      );
    }
  }
}
