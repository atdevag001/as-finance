import { describe, it, expect, vi } from 'vitest';
import { randomUUID } from 'crypto';
import {
  RequestIdMiddleware,
  getRequestId,
  requestContextStorage,
  isValidUuid,
} from '../request-id.middleware';

/** UUID v4 pattern used for assertions. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = { headers } as any;
  const resHeaders: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((key: string, value: string) => {
      resHeaders[key] = value;
    }),
  } as any;
  return { req, res, resHeaders };
}

describe('RequestIdMiddleware', () => {
  const middleware = new RequestIdMiddleware();

  // --- Requirement 49.1: Generate UUID v4 when none provided ---

  it('generates a valid UUID v4 when no x-request-id header is present', () => {
    const { req, res } = createMockReqRes();
    const next = vi.fn();

    middleware.use(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.requestId).toMatch(UUID_REGEX);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
  });

  it('generates unique UUIDs for successive requests without header', () => {
    const ids: string[] = [];

    for (let i = 0; i < 5; i++) {
      const { req, res } = createMockReqRes();
      middleware.use(req, res, vi.fn());
      ids.push(req.requestId);
    }

    // All should be valid UUIDs
    ids.forEach((id) => expect(id).toMatch(UUID_REGEX));
    // All should be unique
    expect(new Set(ids).size).toBe(ids.length);
  });

  // --- Requirement 49.2: Use provided valid x-request-id ---

  it('uses the provided x-request-id when it is a valid UUID', () => {
    const validId = randomUUID();
    const { req, res } = createMockReqRes({ 'x-request-id': validId });
    const next = vi.fn();

    middleware.use(req, res, next);

    expect(req.requestId).toBe(validId);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', validId);
    expect(next).toHaveBeenCalledOnce();
  });

  it('preserves case-insensitive valid UUIDs', () => {
    const upperId = randomUUID().toUpperCase();
    const { req, res } = createMockReqRes({ 'x-request-id': upperId });

    middleware.use(req, res, vi.fn());

    expect(req.requestId).toBe(upperId);
  });

  // --- Requirement 49.3: Reject invalid x-request-id and generate new UUID ---

  it('rejects a non-UUID x-request-id and generates a new UUID', () => {
    const { req, res } = createMockReqRes({ 'x-request-id': 'not-a-uuid' });
    const next = vi.fn();

    middleware.use(req, res, next);

    expect(req.requestId).not.toBe('not-a-uuid');
    expect(req.requestId).toMatch(UUID_REGEX);
    expect(next).toHaveBeenCalledOnce();
  });

  it('rejects an empty string x-request-id', () => {
    const { req, res } = createMockReqRes({ 'x-request-id': '' });

    middleware.use(req, res, vi.fn());

    expect(req.requestId).toMatch(UUID_REGEX);
  });

  it('rejects a UUID-like string with wrong length', () => {
    const { req, res } = createMockReqRes({ 'x-request-id': '12345678-1234-1234-1234' });

    middleware.use(req, res, vi.fn());

    expect(req.requestId).not.toBe('12345678-1234-1234-1234');
    expect(req.requestId).toMatch(UUID_REGEX);
  });

  it('rejects a string with special characters', () => {
    const { req, res } = createMockReqRes({ 'x-request-id': '<script>alert(1)</script>' });

    middleware.use(req, res, vi.fn());

    expect(req.requestId).toMatch(UUID_REGEX);
  });

  // --- Requirement 49.4: Available to downstream handlers ---

  it('attaches requestId to the request object for downstream handlers', () => {
    const validId = randomUUID();
    const { req, res } = createMockReqRes({ 'x-request-id': validId });

    middleware.use(req, res, vi.fn());

    expect(req.requestId).toBe(validId);
  });

  it('sets the x-request-id response header for downstream consumers', () => {
    const validId = randomUUID();
    const { req, res, resHeaders } = createMockReqRes({ 'x-request-id': validId });

    middleware.use(req, res, vi.fn());

    expect(resHeaders['x-request-id']).toBe(validId);
  });

  it('makes requestId available via AsyncLocalStorage inside next()', () => {
    const validId = randomUUID();
    const { req, res } = createMockReqRes({ 'x-request-id': validId });
    let capturedId: string | undefined;

    const next = vi.fn(() => {
      capturedId = getRequestId();
    });

    middleware.use(req, res, next);

    expect(capturedId).toBe(validId);
  });

  it('isolates requestId between sequential requests via AsyncLocalStorage', () => {
    const id1 = randomUUID();
    const id2 = randomUUID();
    const captured: string[] = [];

    const { req: req1, res: res1 } = createMockReqRes({ 'x-request-id': id1 });
    middleware.use(req1, res1, vi.fn(() => {
      captured.push(getRequestId());
    }));

    const { req: req2, res: res2 } = createMockReqRes({ 'x-request-id': id2 });
    middleware.use(req2, res2, vi.fn(() => {
      captured.push(getRequestId());
    }));

    expect(captured[0]).toBe(id1);
    expect(captured[1]).toBe(id2);
  });
});

describe('isValidUuid', () => {
  it('accepts a standard UUID v4', () => {
    expect(isValidUuid(randomUUID())).toBe(true);
  });

  it('accepts uppercase UUIDs', () => {
    expect(isValidUuid(randomUUID().toUpperCase())).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidUuid('')).toBe(false);
  });

  it('rejects plain text', () => {
    expect(isValidUuid('hello-world')).toBe(false);
  });

  it('rejects UUID missing a segment', () => {
    expect(isValidUuid('12345678-1234-1234-1234')).toBe(false);
  });

  it('rejects UUID with invalid hex characters', () => {
    expect(isValidUuid('zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz')).toBe(false);
  });
});

describe('getRequestId', () => {
  it('returns a new UUID when called outside of request context', () => {
    const id = getRequestId();
    expect(id).toMatch(UUID_REGEX);
  });

  it('returns the stored requestId when called inside a context', () => {
    requestContextStorage.run({ requestId: 'ctx-id-123' }, () => {
      expect(getRequestId()).toBe('ctx-id-123');
    });
  });
});
