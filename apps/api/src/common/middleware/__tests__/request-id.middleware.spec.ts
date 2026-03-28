import { describe, it, expect, vi } from 'vitest';
import { RequestIdMiddleware, getRequestId, requestContextStorage } from '../request-id.middleware';

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

  it('generates a UUID when no x-request-id header is present', () => {
    const { req, res } = createMockReqRes();
    const next = vi.fn();
    middleware.use(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.requestId).toBeDefined();
    expect(typeof req.requestId).toBe('string');
    expect(req.requestId.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', req.requestId);
  });

  it('propagates an existing x-request-id header', () => {
    const { req, res } = createMockReqRes({ 'x-request-id': 'existing-id-123' });
    const next = vi.fn();
    middleware.use(req, res, next);

    expect(req.requestId).toBe('existing-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', 'existing-id-123');
  });

  it('makes requestId available via AsyncLocalStorage inside next()', () => {
    const { req, res } = createMockReqRes({ 'x-request-id': 'als-test-id' });
    let capturedId: string | undefined;

    const next = vi.fn(() => {
      capturedId = getRequestId();
    });

    middleware.use(req, res, next);
    expect(capturedId).toBe('als-test-id');
  });
});

describe('getRequestId', () => {
  it('returns "unknown" when called outside of request context', () => {
    expect(getRequestId()).toBe('unknown');
  });

  it('returns the requestId when called inside a context', () => {
    requestContextStorage.run({ requestId: 'ctx-id' }, () => {
      expect(getRequestId()).toBe('ctx-id');
    });
  });
});
