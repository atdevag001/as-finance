import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import { HealthController } from '../health.controller';
import type { PrismaService } from '../../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../../../common/guards/jwt-auth.guard';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRawUnsafe: ReturnType<typeof vi.fn> };

  // Minimal Express Response double — controller now writes the body directly
  // so we capture status() + json() calls instead of inspecting a return value.
  function makeRes() {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    };
    return res as unknown as Response & {
      status: ReturnType<typeof vi.fn>;
      json: ReturnType<typeof vi.fn>;
    };
  }

  beforeEach(() => {
    prisma = { $queryRawUnsafe: vi.fn() };
    controller = new HealthController(prisma as unknown as PrismaService);
  });

  // --- Requirement 59.1: Liveness probe ---
  describe('GET /health/live', () => {
    it('should return 200 with { status: "ok" }', () => {
      const result = controller.live();
      expect(result).toEqual({ status: 'ok' });
    });
  });

  // --- Requirement 59.2: Readiness probe (DB connected) ---
  describe('GET /health/ready', () => {
    it('should respond 200 with { status: "ok", database: "connected" } when DB is reachable', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
      const res = makeRes();

      await controller.ready(res);

      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: 'ok',
        database: 'connected',
      });
    });

    // --- Requirement 59.3: Readiness probe (DB disconnected → 503) ---
    it('should respond 503 with { status: "error", database: "disconnected" } when DB is unreachable', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('Connection refused'));
      const res = makeRes();

      await controller.ready(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        database: 'disconnected',
      });
    });

    it('should respond 503 when the DB probe exceeds the timeout', async () => {
      // Probe that never resolves — must be cut off by the in-controller timeout race.
      prisma.$queryRawUnsafe.mockImplementation(
        () => new Promise(() => {}),
      );
      const res = makeRes();

      vi.useFakeTimers();
      try {
        const pending = controller.ready(res);
        await vi.advanceTimersByTimeAsync(2500);
        await pending;
      } finally {
        vi.useRealTimers();
      }

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        status: 'error',
        database: 'disconnected',
      });
    });
  });

  // --- Requirement 59.4: Public access (no JWT required) ---
  describe('public access metadata', () => {
    it('should have IS_PUBLIC_KEY metadata set to true on the controller class', () => {
      const metadata = Reflect.getMetadata(IS_PUBLIC_KEY, HealthController);
      expect(metadata).toBe(true);
    });
  });

  // --- Requirement 59.5: Skip throttle ---
  describe('skip throttle metadata', () => {
    it('should have SkipThrottle metadata on the /live handler only', () => {
      // /live does no DB work and is hit by k8s probes; /ready must keep default
      // per-IP throttling so an unauthenticated client cannot probe the DB at line rate.
      const liveSkip = Reflect.getMetadata(
        'THROTTLER:SKIPdefault',
        HealthController.prototype.live,
      );
      const readySkip = Reflect.getMetadata(
        'THROTTLER:SKIPdefault',
        HealthController.prototype.ready,
      );
      const classSkip = Reflect.getMetadata(
        'THROTTLER:SKIPdefault',
        HealthController,
      );
      expect(liveSkip).toBe(true);
      expect(readySkip).toBeUndefined();
      expect(classSkip).toBeUndefined();
    });
  });
});
