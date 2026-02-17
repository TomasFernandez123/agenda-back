import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { Roles, Role, CurrentUser, Public } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';
import { ProfessionalsService } from '../professionals/professionals.service';
import { ServicesService } from '../services/services.service';
import { AvailabilityService } from '../availability/availability.service';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly professionalsService: ProfessionalsService,
    private readonly servicesService: ServicesService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  @Post()
  @Roles(Role.SUPER_ADMIN)
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Get()
  @Roles(Role.SUPER_ADMIN)
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get('me')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async getMyProfile(@CurrentUser() user: any) {
    if (!user.tenantId) {
      throw new BadRequestException('User does not belong to a tenant');
    }
    return this.tenantsService.findById(user.tenantId);
  }

  @Patch('me')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async updateMyProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateTenantDto,
  ) {
    if (!user.tenantId) {
      throw new BadRequestException('User does not belong to a tenant');
    }
    return this.tenantsService.update(user.tenantId, dto);
  }

  @Get(':id')
  @Roles(Role.SUPER_ADMIN)
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.tenantsService.findById(id);
  }

  @Get('slug/:slug')
  @Public()
  findBySlug(@Param('slug') slug: string) {
    return this.tenantsService.findBySlug(slug);
  }

  @Get('slug/:slug/professionals')
  @Public()
  async findActiveProfessionalsBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return this.professionalsService.findActiveByTenantId((tenant as any)._id.toString());
  }

  @Get('slug/:slug/services')
  @Public()
  async findActiveServicesBySlug(@Param('slug') slug: string) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    return this.servicesService.findAll((tenant as any)._id.toString());
  }

  @Get('slug/:slug/professionals/:id/availability')
  @Public()
  async findProfessionalAvailabilityBySlug(
    @Param('slug') slug: string,
    @Param('id', ParseObjectIdPipe) professionalId: string,
  ) {
    const tenant = await this.tenantsService.findBySlug(slug);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }

    const professional = await this.professionalsService.findById(professionalId);
    const tenantId = (tenant as any)._id.toString();
    if (
      professional.tenantId.toString() !== tenantId ||
      professional.isActive === false
    ) {
      throw new NotFoundException('Professional not found');
    }

    const availability = await this.availabilityService.getAvailability(
      tenantId,
      professionalId,
    );

    return {
      weeklyRules: availability?.weeklyRules || [],
      exceptions: availability?.exceptions || [],
    };
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }
}
