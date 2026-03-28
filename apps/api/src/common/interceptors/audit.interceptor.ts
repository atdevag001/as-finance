import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request } from 'express';
import { getRequestId } from '../middleware/request-id.middleware';
import { JwtPayload } from '../guards/jwt-auth.guard';

/**
 * Base audit logging interceptor.
 *
 * Logs the actor, action (HTTP method + path), requestId, and response status
 * for every request. Finance-specific audit entries (before/after state,
 * target entity, etc.) are created by the individual service methods within
 * their transactions — this interceptor provides the outer request-level trace.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload; requestId?: string }>();

    const requestId = request.requestId ?? getRequestId();
    const method = request.method;
    const url = request.url;
    const actorId = request.user?.sub ?? 'anonymous';
    const actorRole = request.user?.role ?? 'unknown';
    const ip = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log({
            requestId,
            actorId,
            actorRole,
            method,
            url,
            ip,
            durationMs: duration,
            status: 'success',
          });
        },
        error: (error: unknown) => {
          const duration = Date.now() - startTime;
          this.logger.warn({
            requestId,
            actorId,
            actorRole,
            method,
            url,
            ip,
            durationMs: duration,
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        },
      }),
    );
  }
}
