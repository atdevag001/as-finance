import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService, DashboardKPIs } from './dashboard.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('dashboard')
@Controller('dashboard')
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePermission('dashboard.read')
  @ApiOperation({ summary: 'Get dashboard KPIs' })
  @ApiResponse({ status: 200, description: 'Dashboard KPIs retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Missing dashboard.read permission' })
  async getKPIs(): Promise<DashboardKPIs> {
    return this.dashboardService.getKPIs();
  }
}
