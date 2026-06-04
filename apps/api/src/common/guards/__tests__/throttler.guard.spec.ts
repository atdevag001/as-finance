import { describe, it, expect } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { CustomThrottlerGuard } from '../throttler.guard';

/**
 * Helper to create a testable instance of CustomThrottlerGuard.
 * We pass minimal mocks for the ThrottlerGuard constructor dependencies.
 */
function createGuard(): CustomThrottlerGuard {
  const options = { throttlers: [{ ttl: 60_000, limit: 100 }] } as any;
  const storageService = { get: async () => ({}), set: async () => {} } as any;
  const reflector = new Reflector();
  return new CustomThrottlerGuard(options, storageService, reflector);
}

/**
 * Access the protected getTracker method for testing.
 * We cast to `any` to call the protected method directly.
 */
function callGetTracker(guard: CustomThrottlerGuard, req: Record<string, unknown>): Promise<string> {
  return (guard as any).getTracker(req);
}

/**
 * Access the protected throwThrottlingException method for testing.
 */
function callThrowThrottlingException(guard: CustomThrottlerGuard, context: ExecutionContext): Promise<void> {
  return (guard as any).throwThrottlingException(context);
}

describe('CustomThrottlerGuard', () => {
  // --- Validates: Requirement 69.1 — getTracker returns user sub when JWT present ---

  it('returns user sub when JWT user is present on the request', async () => {
    const guard = createGuard();
    const req = { user: { sub: 'user-abc-123' }, ip: '192.168.1.1' };
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('user:user-abc-123');
  });

  it('returns user sub regardless of IP being present', async () => {
    const guard = createGuard();
    const req = { user: { sub: 'u-42' }, ip: '10.0.0.1' };
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('user:u-42');
  });

  it('returns user sub when IP is missing', async () => {
    const guard = createGuard();
    const req = { user: { sub: 'user-no-ip' } };
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('user:user-no-ip');
  });

  // --- Validates: Requirement 69.2 — getTracker falls back to IP when no user ---

  it('falls back to IP address when no user is present', async () => {
    const guard = createGuard();
    const req = { ip: '203.0.113.50' };
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('ip:203.0.113.50');
  });

  it('falls back to IP when user object exists but has no sub', async () => {
    const guard = createGuard();
    const req = { user: {}, ip: '10.20.30.40' };
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('ip:10.20.30.40');
  });

  it('falls back to IP when user is undefined', async () => {
    const guard = createGuard();
    const req = { user: undefined, ip: '127.0.0.1' };
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('ip:127.0.0.1');
  });

  it('falls back to IP when user.sub is empty string', async () => {
    const guard = createGuard();
    const req = { user: { sub: '' }, ip: '172.16.0.1' };
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('ip:172.16.0.1');
  });

  // --- Validates: Requirement 69.3 — getTracker returns 'unknown' when neither available ---

  it("returns 'unknown' when neither user nor IP is available", async () => {
    const guard = createGuard();
    const req = {};
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('unknown');
  });

  it("returns 'unknown' when user is null and IP is undefined", async () => {
    const guard = createGuard();
    const req = { user: null, ip: undefined };
    const tracker = await callGetTracker(guard, req);
    expect(tracker).toBe('unknown');
  });

  // --- Validates: Requirement 69.4 — throwThrottlingException throws ThrottlerException ---

  it('throws ThrottlerException with correct message', async () => {
    const guard = createGuard();
    const mockContext = {} as ExecutionContext;
    await expect(callThrowThrottlingException(guard, mockContext)).rejects.toThrow(ThrottlerException);
  });

  it('throws with the exact message "Too many requests. Please try again later."', async () => {
    const guard = createGuard();
    const mockContext = {} as ExecutionContext;
    await expect(callThrowThrottlingException(guard, mockContext)).rejects.toThrow(
      'Too many requests. Please try again later.',
    );
  });
});
