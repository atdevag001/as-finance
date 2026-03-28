import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';

/**
 * Custom throttler guard that uses authenticated user ID when available,
 * falling back to IP address for unauthenticated requests (e.g., auth endpoints).
 *
 * Rate limits:
 * - Auth endpoints: 10 req/min per IP
 * - API endpoints: 100 req/min per authenticated user
 * - File upload: 20 uploads/min per user (applied via decorator)
 * - Report generation: 5/min per user (applied via decorator)
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ConstructorParameters<typeof ThrottlerGuard>[0],
    storageService: ConstructorParameters<typeof ThrottlerGuard>[1],
    reflector: Reflector,
  ) {
    super(options, storageService, reflector);
  }

  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    // Use authenticated user ID if available, otherwise fall back to IP
    const user = req['user'] as { sub?: string } | undefined;
    if (user?.sub) {
      return user.sub;
    }
    return (req['ip'] as string) ?? 'unknown';
  }

  protected override async throwThrottlingException(
    _context: ExecutionContext,
  ): Promise<void> {
    throw new ThrottlerException(
      'Too many requests. Please try again later.',
    );
  }
}
