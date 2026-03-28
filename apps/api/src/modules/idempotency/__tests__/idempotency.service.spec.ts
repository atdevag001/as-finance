import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../idempotency.service';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Unit tests for IdempotencyService.
 *
 * Validates: Requirements 20.1, 5.5, 6.4
 */
describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockPrisma: {
    idempotency_keys: {
      findUnique: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      deleteMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      idempotency_keys: {
        findUnique: vi.fn(),
        create: vi.fn(),
        deleteMany: vi.fn(),
      },
    };

    service = new IdempotencyService(mockPrisma as unknown as PrismaService);
  });

  describe('find', () => {
    it('should return null when key does not exist', async () => {
      mockPrisma.idempotency_keys.findUnique.mockResolvedValue(null);

      const result = await service.find('nonexistent-key');

      expect(result).toBeNull();
      expect(mockPrisma.idempotency_keys.findUnique).toHaveBeenCalledWith({
        where: { key: 'nonexistent-key' },
      });
    });

    it('should return cached result when key exists', async () => {
      const body = { id: 'abc', amount: 50000 };
      mockPrisma.idempotency_keys.findUnique.mockResolvedValue({
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

    it('should handle concurrent duplicate by retrying SELECT after delay', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`key`)',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      mockPrisma.idempotency_keys.create.mockRejectedValue(uniqueError);

      const cachedBody = { id: 'original' };
      mockPrisma.idempotency_keys.findUnique.mockResolvedValue({
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

    it('should re-throw unique constraint error if retry SELECT returns null', async () => {
      const uniqueError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`key`)',
        { code: 'P2002', clientVersion: '5.0.0' },
      );
      mockPrisma.idempotency_keys.create.mockRejectedValue(uniqueError);
      mockPrisma.idempotency_keys.findUnique.mockResolvedValue(null);

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
        .calls[0]?.[0] as any;
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
