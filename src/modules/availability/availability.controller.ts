import { Controller, Get, Put, Body, Param } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { SetAvailabilityDto } from './dto/availability.dto';
import { Roles, Role, CurrentUser } from '../../common/decorators';
import { ParseObjectIdPipe } from '../../common/pipes/parse-objectid.pipe';

@Controller('professionals')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get(':id/availability')
  getAvailability(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: any,
  ) {
    return this.availabilityService.getAvailability(user.tenantId, id);
  }

  @Put(':id/availability')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN, Role.STAFF)
  setAvailability(
    @Param('id', ParseObjectIdPipe) id: string,
    @Body() dto: SetAvailabilityDto,
    @CurrentUser() user: any,
  ) {
    return this.availabilityService.setAvailability(user.tenantId, id, dto);
  }
}
