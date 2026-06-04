import { Injectable, type ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

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
  // Constructor inherited from ThrottlerGuard — Nest DI resolves it.

  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    // Use authenticated user id when available so per-user limits actually
    // throttle a single account regardless of IP rotation. Falls back to the
    // request IP for unauthenticated requests (e.g., login).
    // Accepts either `userId` or `sub` (JWT subject claim) — both refer to the
    // authenticated user's id.
    const user = req['user'] as { sub?: string; userId?: string } | undefined;
    const userId = user?.userId ?? user?.sub;
    if (userId) {
      return Promise.resolve(`user:${userId}`);
    }
    const ip = req['ip'] as string | undefined;
    return Promise.resolve(ip ? `ip:${ip}` : 'unknown');
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
  ): Promise<void> {
    return Promise.reject(
      new ThrottlerException('Too many requests. Please try again later.'),
    );
  }
}
