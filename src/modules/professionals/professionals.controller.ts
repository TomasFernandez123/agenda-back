import { Controller, Get, Post, Patch, Body, Param } from '@nestjs/common';
import { ProfessionalsService } from './professionals.service';
import { CreateProfessionalDto, UpdateProfessionalDto } from './dto/professional.dto';
import { Roles, Role, CurrentUser } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';

@Controller('professionals')
export class ProfessionalsController {
  constructor(private readonly professionalsService: ProfessionalsService) {}

  @Post()
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  create(@Body() dto: CreateProfessionalDto, @CurrentUser() user: any) {
    return this.professionalsService.create(user.tenantId, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.professionalsService.findAll(user.tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseObjectIdPipe) id: string) {
    return this.professionalsService.findById(id);
  }

  @Patch(':id')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  update(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: UpdateProfessionalDto,
  ) {
    return this.professionalsService.update(id, dto);
  }
}
