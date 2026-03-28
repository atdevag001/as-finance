import { Controller, Get, Post, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { NotificationService } from './notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @RequirePermission('notification.read')
  @ApiOperation({ summary: 'List outbox messages with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated outbox messages' })
  async findAll(@Query() query: NotificationQueryDto) {
    return this.notificationService.findAll(query);
  }

  @Post(':id/retry')
  @RequirePermission('notification.retry')
  @ApiOperation({ summary: 'Retry a failed or dead_letter notification message' })
  @ApiResponse({ status: 200, description: 'Message reset for retry' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  @ApiResponse({ status: 422, description: 'Message not in retryable status' })
  async retry(@Param('id', ParseUUIDPipe) id: string) {
    return this.notificationService.retry(id);
  }
}
