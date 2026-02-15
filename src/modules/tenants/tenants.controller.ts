import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, UpdateTenantDto } from './dto/tenant.dto';
import { Roles, Role, CurrentUser, Public } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

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

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantsService.update(id, dto);
  }
}
