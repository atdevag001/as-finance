import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('audit-logs')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @RequirePermission('audit.read')
  @ApiOperation({ summary: 'Query audit logs with filters and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated audit log entries' })
  async findAll(@Query() query: AuditLogQueryDto) {
    return this.auditService.findAll(query);
  }
}
