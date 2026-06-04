import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../health.controller';
import type { PrismaService } from '../../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../../../common/guards/jwt-auth.guard';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRawUnsafe: ReturnType<typeof vi.fn> };

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
    it('should return 200 with { status: "ok", database: "connected" } when DB is reachable', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

      const result = await controller.ready();

      expect(result).toEqual({ status: 'ok', database: 'connected' });
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    });

    // --- Requirement 59.3: Readiness probe (DB disconnected → 503) ---
    it('should throw ServiceUnavailableException when DB is unreachable', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('Connection refused'));

      await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should include { status: "error", database: "disconnected" } in 503 response body', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('timeout'));

      try {
        await controller.ready();
        expect.fail('Expected ServiceUnavailableException');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        const response = (error as ServiceUnavailableException).getResponse();
        expect(response).toMatchObject({
          status: 'error',
          database: 'disconnected',
        });
      }
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
    it('should have SkipThrottle metadata set on the controller class', () => {
      // @SkipThrottle() sets 'THROTTLER:SKIPdefault' metadata key on the class
      const skipMeta = Reflect.getMetadata('THROTTLER:SKIPdefault', HealthController);
      expect(skipMeta).toBe(true);
    });
  });
});
