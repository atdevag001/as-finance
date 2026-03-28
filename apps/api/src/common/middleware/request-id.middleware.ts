import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface RequestContext {
  requestId: string;
}

/** Singleton async local storage for request-scoped context (e.g., requestId for logging). */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Convenience accessor — returns the current requestId or 'unknown'. */
export function getRequestId(): string {
  return requestContextStorage.getStore()?.requestId ?? 'unknown';
}

/**
 * Generates or propagates the `x-request-id` header and stores it in
 * AsyncLocalStorage so downstream code (filters, interceptors, loggers)
 * can access it without passing the request object around.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? randomUUID();

    // Attach to request for guards/controllers that have access to the request
    (req as Request & { requestId: string }).requestId = requestId;

    // Echo back on the response
    res.setHeader('x-request-id', requestId);

    // Run the rest of the request inside the async local storage context
    requestContextStorage.run({ requestId }, () => {
      next();
    });
  }
}
