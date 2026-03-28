import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from '../health.controller';
import { PrismaService } from '../../../database/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRawUnsafe: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    prisma = { $queryRawUnsafe: vi.fn() };
    controller = new HealthController(prisma as unknown as PrismaService);
  });

  describe('GET /health/live', () => {
    it('should return status ok', () => {
      expect(controller.live()).toEqual({ status: 'ok' });
    });
  });

  describe('GET /health/ready', () => {
    it('should return ok with database connected when DB is reachable', async () => {
      prisma.$queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

      const result = await controller.ready();

      expect(result).toEqual({ status: 'ok', database: 'connected' });
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
    });

    it('should throw ServiceUnavailableException when DB is unreachable', async () => {
      prisma.$queryRawUnsafe.mockRejectedValue(new Error('Connection refused'));

      await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
    });

    it('should include disconnected status in error response body', async () => {
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
});
