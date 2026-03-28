import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException, SetMetadata } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';

@ApiTags('health')
@Controller('health')
@SetMetadata(IS_PUBLIC_KEY, true)
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  live() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — checks database connectivity' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  @ApiResponse({ status: 503, description: 'Database not connected' })
  async ready() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'disconnected',
      });
    }
  }
}
