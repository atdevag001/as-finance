import { Controller, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { DashboardService, DashboardKPIs } from './dashboard.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';

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
  async getKPIs(@Req() req: Request & { user: JwtPayload }): Promise<DashboardKPIs> {
    return this.dashboardService.getKPIs(req.user.sub, req.user.role);
  }
}
