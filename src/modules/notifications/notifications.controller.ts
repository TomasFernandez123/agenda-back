import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser, Role, Roles } from '../../common/decorators';
import { NotificationsService } from './notifications.service';
import { QueryReminderLogsDto } from './dto/query-reminder-logs.dto';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('reminders/logs')
  @Roles(Role.SUPER_ADMIN, Role.ADMIN)
  async getReminderLogs(
    @CurrentUser() user: any,
    @Query() query: QueryReminderLogsDto,
  ) {
    return this.notificationsService.getReminderLogs(
      user.tenantId,
      query.limit || 20,
    );
  }
}
