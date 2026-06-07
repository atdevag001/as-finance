import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Res,
  SetMetadata,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { IS_PUBLIC_KEY } from '../../common/guards/jwt-auth.guard';
import { PrismaService } from '../../database/prisma.service';

// Cap the readiness DB probe so a hung pool can't pile up requests and starve the event loop.
const READINESS_DB_TIMEOUT_MS = 2000;

@ApiTags('health')
@Controller('health')
@SetMetadata(IS_PUBLIC_KEY, true)
@SkipThrottle()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

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
  async ready(@Res() res: Response): Promise<Response> {
    try {
      // Race the probe against a timeout so a stuck DB can't hang the request indefinitely.
      await Promise.race([
        this.prisma.$queryRawUnsafe('SELECT 1'),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error('readiness timeout')),
            READINESS_DB_TIMEOUT_MS,
          ),
        ),
      ]);
      return res
        .status(HttpStatus.OK)
        .json({ status: 'ok', database: 'connected' });
    } catch (err) {
      // Capture the underlying DB/timeout error — GlobalExceptionFilter would only see 'Service Unavailable'.
      this.logger.error(
        { err: err instanceof Error ? err.message : err },
        'Readiness check failed',
      );
      // Bypass GlobalExceptionFilter so the custom { status, database } body reaches the operator/monitor.
      return res
        .status(HttpStatus.SERVICE_UNAVAILABLE)
        .json({ status: 'error', database: 'disconnected' });
    }
  }
}
