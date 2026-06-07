import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../idempotency.service';
import type { PrismaService } from '../../../database/prisma.service';

/**
 * Unit tests for IdempotencyService.
 *
 * Validates: Requirements 35.1, 35.2, 35.3, 35.4, 35.5
 */
describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockPrisma: {
    idempotency_keys: {
      findFirst: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      idempotency_keys: {
        findFirst: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    service = new IdempotencyService(mockPrisma as unknown as PrismaService);
  });

  describe('find', () => {
    it('should return null when key does not exist', async () => {
      mockPrisma.idempotency_keys.findFirst.mockResolvedValue(null);

      const result = await service.find('nonexistent-key');

      expect(result).toBeNull();
      expect(mockPrisma.idempotency_keys.findFirst).toHaveBeenCalledWith({
        where: { key: 'nonexistent-key', expires_at: { gt: expect.any(Date) } },
      });
    });

    it('should return cached result when key exists and is not expired', async () => {
      const body = { id: 'abc', amount: 50000 };
      mockPrisma.idempotency_keys.findFirst.mockResolvedValue({
        id: 'uuid-1',
        key: 'existing-key',
        operation_type: 'collection',
        result_status: 200,
        result_body: body,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 86400000),
      });

      const result = await service.find('existing-key');

      expect(result).toEqual({
        resultStatus: 200,
        resultBody: body,
      });
    });

    it('should return null when the row is expired (filtered by where clause)', async () => {
      // The expires_at: { gt: now } filter means an expired row is not returned
      // by Prisma at all, so the service sees null.
      mockPrisma.idempotency_keys.findFirst.mockResolvedValue(null);

      const result = await service.find('expired-key');

      expect(result).toBeNull();
    });
  });

  describe('store', () => {
    it('should create a new idempotency key record', async () => {
      const body = { disbursementId: 'd-1' };
      mockPrisma.idempotency_keys.create.mockResolvedValue({
        id: 'uuid-2',
        key: 'new-key',
        operation_type: 'disbursement',
        result_status: 200,
        result_body: body,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 86400000),
      });

      const result = await service.store('new-key', 'disbursement', 200, body);

      expect(result).toEqual({ resultStatus: 200, resultBody: body });
      expect(mockPrisma.idempotency_keys.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: 'new-key',
          operation_type: 'disbursement',
          result_status: 200,
          result_body: body,
        }),
      });
    });

    it('should use provided transaction client when given', async () => {
      const txClient = {
        idempotency_keys: {
          create: vi.fn().mockResolvedValue({
            id: 'uuid-3',
            key: 'tx-key',
            operation_type: 'collection',
            result_status: 201,
            result_body: { ok: true },
            created_at: new Date(),
            expires_at: new Date(Date.now() + 86400000),
          }),
        },
      } as any;

      const result = await service.store(
        'tx-key',
        'collection',
        201,
        { ok: true },
        txClient,
      );

      expect(result).toEqual({ resultStatus: 201, resultBody: { ok: true } });
      expect(txClient.idempotency_keys.create).toHaveBeenCalled();
      // Main prisma client should NOT have been called
      expect(mockPrisma.idempotency_keys.create).not.toHaveBeenCalled();
    });

    it('should handle concurrent duplicate (no tx) by retrying SELECT after delay', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`key`)',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      mockPrisma.idempotency_keys.create.mockRejectedValue(uniqueError);

      const cachedBody = { id: 'original' };
      mockPrisma.idempotency_keys.findFirst.mockResolvedValue({
        id: 'uuid-4',
        key: 'dup-key',
        operation_type: 'collection',
        result_status: 200,
        result_body: cachedBody,
        created_at: new Date(),
        expires_at: new Date(Date.now() + 86400000),
      });

      const result = await service.store(
        'dup-key',
        'collection',
        200,
        { id: 'new-attempt' },
      );

      expect(result).toEqual({
        resultStatus: 200,
        resultBody: cachedBody,
      });
    });

    it('should re-throw P2002 when called inside a tx (avoids poisoning the outer tx)', async () => {
      // Inside a Postgres transaction, any constraint violation aborts the tx;
      // the service must propagate so the caller rolls back instead of returning
      // a "cached" body while the outer $transaction silently fails on commit.
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`key`)',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      const txClient = {
        idempotency_keys: {
          create: vi.fn().mockRejectedValue(uniqueError),
        },
      } as any;

      await expect(
        service.store('dup-tx-key', 'collection', 200, {}, txClient),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);

      // Must NOT have attempted a retry SELECT on the main client —
      // doing so would mask the aborted-tx error.
      expect(mockPrisma.idempotency_keys.findFirst).not.toHaveBeenCalled();
    });

    it('should re-throw unique constraint error if retry SELECT returns null', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`key`)',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      mockPrisma.idempotency_keys.create.mockRejectedValue(uniqueError);
      mockPrisma.idempotency_keys.findFirst.mockResolvedValue(null);

      await expect(
        service.store('ghost-key', 'reversal', 200, {}),
      ).rejects.toThrow(Prisma.PrismaClientKnownRequestError);
    });

    it('should re-throw non-unique-constraint errors', async () => {
      const genericError = new Error('Connection lost');
      mockPrisma.idempotency_keys.create.mockRejectedValue(genericError);

      await expect(
        service.store('fail-key', 'disbursement', 200, {}),
      ).rejects.toThrow('Connection lost');
    });

    it('should set expires_at approximately 24 hours in the future', async () => {
      mockPrisma.idempotency_keys.create.mockImplementation(
        async (args: any) => ({ ...args.data, id: 'uuid-5' }),
      );

      const before = Date.now();
      await service.store('ttl-key', 'collection', 200, {});
      const after = Date.now();

      const createCall = mockPrisma.idempotency_keys.create.mock
        .calls[0]?.[0];
      const expiresAt = new Date(
        createCall.data.expires_at as string,
      ).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;

      expect(expiresAt).toBeGreaterThanOrEqual(before + twentyFourHours - 1000);
      expect(expiresAt).toBeLessThanOrEqual(after + twentyFourHours + 1000);
    });
  });

  describe('cleanupExpired', () => {
    it('should delete expired keys and return count', async () => {
      mockPrisma.idempotency_keys.deleteMany.mockResolvedValue({ count: 5 });

      const count = await service.cleanupExpired();

      expect(count).toBe(5);
      expect(mockPrisma.idempotency_keys.deleteMany).toHaveBeenCalledWith({
        where: {
          expires_at: { lt: expect.any(Date) },
        },
      });
    });

    it('should return 0 when no expired keys exist', async () => {
      mockPrisma.idempotency_keys.deleteMany.mockResolvedValue({ count: 0 });

      const count = await service.cleanupExpired();

      expect(count).toBe(0);
    });
  });
});
