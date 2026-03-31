import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

export interface RequestContext {
  requestId: string;
}

/** UUID v4 pattern for validating x-request-id header values. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true when the value looks like a valid UUID. */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/** Singleton async local storage for request-scoped context (e.g., requestId for logging). */
export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/** Convenience accessor — returns the current requestId or generates a new UUID fallback. */
export function getRequestId(): string {
  return requestContextStorage.getStore()?.requestId ?? randomUUID();
}

/**
 * Generates or propagates the `x-request-id` header and stores it in
 * AsyncLocalStorage so downstream code (filters, interceptors, loggers)
 * can access it without passing the request object around.
 *
 * If the incoming x-request-id is not a valid UUID the header is ignored
 * and a fresh UUID v4 is generated instead.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers['x-request-id'] as string | undefined;
    const requestId =
      incoming && isValidUuid(incoming) ? incoming : randomUUID();

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
