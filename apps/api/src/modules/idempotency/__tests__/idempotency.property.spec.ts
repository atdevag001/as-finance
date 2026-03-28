import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../idempotency.service';
import { PrismaService } from '../../../database/prisma.service';

/**
 * Property 20: Idempotency
 *
 * For all finance-affecting operations (collection, disbursement, reversal)
 * with an idempotency key, processing the same key twice SHALL return the
 * same result and SHALL NOT create duplicate records.
 * Formally: f(key) == f(f(key)) in terms of observable side effects.
 *
 * **Validates: Requirements 5.5, 6.4, 20.1, 25.9**
 */

// --- Generators ---

/** Generates a non-empty idempotency key string (UUID-like or arbitrary) */
const idempotencyKeyArb = fc.string({ minLength: 1, maxLength: 64, unit: 'grapheme' }).filter(
  (s) => /^[a-z0-9-]+$/.test(s),
);

/** Generates a valid operation type */
const operationTypeArb = fc.constantFrom(
  'collection',
  'disbursement',
  'reversal',
  'penalty',
);

/** Generates a valid HTTP-like result status */
const resultStatusArb = fc.constantFrom(200, 201);

/** Generates a valid result body (JSON-serializable object) */
const resultBodyArb = fc.record({
  id: fc.uuid(),
  amount: fc.integer({ min: 100, max: 10_000_000 }),
  status: fc.constantFrom('success', 'completed', 'processed'),
});

/** Combined arbitrary for a full idempotency operation */
const idempotencyInputArb = fc.record({
  key: idempotencyKeyArb,
  operationType: operationTypeArb,
  resultStatus: resultStatusArb,
  resultBody: resultBodyArb,
});

// --- In-Memory Store ---

/**
 * Creates an IdempotencyService backed by an in-memory store that enforces
 * unique constraint on `key`, simulating real Prisma/PostgreSQL behavior.
 */
function createServiceWithInMemoryStore() {
  const store = new Map<string, {
    id: string;
    key: string;
    operation_type: string;
    result_status: number;
    result_body: unknown;
    created_at: Date;
    expires_at: Date;
  }>();

  const mockPrisma = {
    idempotency_keys: {
      findUnique: vi.fn().mockImplementation(
        async (args: { where: { key: string } }) => {
          return store.get(args.where.key) ?? null;
        },
      ),
      create: vi.fn().mockImplementation(
        async (args: {
          data: {
            key: string;
            operation_type: string;
            result_status: number;
            result_body: unknown;
            expires_at: Date;
          };
        }) => {
          const key = args.data.key;

          // Enforce unique constraint — simulate Prisma P2002
          if (store.has(key)) {
            throw new Prisma.PrismaClientKnownRequestError(
              'Unique constraint failed on the fields: (`key`)',
              { code: 'P2002', clientVersion: '5.0.0' },
            );
          }

          const entry = {
            id: crypto.randomUUID(),
            key,
            operation_type: args.data.operation_type,
            result_status: args.data.result_status,
            result_body: args.data.result_body,
            created_at: new Date(),
            expires_at: args.data.expires_at,
          };
          store.set(key, entry);
          return entry;
        },
      ),
      deleteMany: vi.fn().mockImplementation(async () => ({ count: 0 })),
    },
  };

  const service = new IdempotencyService(
    mockPrisma as unknown as PrismaService,
  );

  // Neutralize the 100ms retry delay to avoid test timeouts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (service as any).delay = () => Promise.resolve();

  return { service, store, mockPrisma };
}

// --- Property Tests ---

describe('Property 20: Idempotency', () => {
  it('for all valid (key, operationType, resultStatus, resultBody), store(key) then find(key) returns the same result', async () => {
    await fc.assert(
      fc.asyncProperty(idempotencyInputArb, async (input) => {
        const { service } = createServiceWithInMemoryStore();

        // Store the key
        const storeResult = await service.store(
          input.key,
          input.operationType,
          input.resultStatus,
          input.resultBody,
        );

        // Find the key
        const findResult = await service.find(input.key);

        // The stored result and the found result must be identical
        expect(findResult).not.toBeNull();
        expect(findResult!.resultStatus).toBe(storeResult.resultStatus);
        expect(findResult!.resultBody).toEqual(storeResult.resultBody);

        // Both must match the original input
        expect(findResult!.resultStatus).toBe(input.resultStatus);
        expect(findResult!.resultBody).toEqual(input.resultBody);
      }),
      { numRuns: 200 },
    );
  });

  it('for all valid keys, store(key) twice returns the same result both times — no duplicate records', async () => {
    await fc.assert(
      fc.asyncProperty(idempotencyInputArb, async (input) => {
        const { service, store } = createServiceWithInMemoryStore();

        // First store — creates the record
        const firstResult = await service.store(
          input.key,
          input.operationType,
          input.resultStatus,
          input.resultBody,
        );

        // Second store with same key — should return cached result, not create duplicate
        const secondResult = await service.store(
          input.key,
          input.operationType,
          input.resultStatus,
          input.resultBody,
        );

        // Both results must be identical
        expect(secondResult.resultStatus).toBe(firstResult.resultStatus);
        expect(secondResult.resultBody).toEqual(firstResult.resultBody);

        // Only one record should exist in the store (no duplicates)
        expect(store.size).toBe(1);
      }),
      { numRuns: 200 },
    );
  });

  it('f(key) == f(f(key)) — the result of processing is identical regardless of how many times it is called', async () => {
    await fc.assert(
      fc.asyncProperty(
        idempotencyInputArb,
        fc.integer({ min: 2, max: 5 }),
        async (input, repeatCount) => {
          const { service, store } = createServiceWithInMemoryStore();

          // f(key) — first invocation
          const firstResult = await service.store(
            input.key,
            input.operationType,
            input.resultStatus,
            input.resultBody,
          );

          // f(f(key)), f(f(f(key))), ... — repeated invocations
          for (let i = 1; i < repeatCount; i++) {
            const repeatedResult = await service.store(
              input.key,
              input.operationType,
              input.resultStatus,
              input.resultBody,
            );

            // Each repeated call must return the same result
            expect(repeatedResult.resultStatus).toBe(firstResult.resultStatus);
            expect(repeatedResult.resultBody).toEqual(firstResult.resultBody);
          }

          // Verify no duplicate records were created
          expect(store.size).toBe(1);

          // Verify find also returns the same result
          const findResult = await service.find(input.key);
          expect(findResult).not.toBeNull();
          expect(findResult!.resultStatus).toBe(firstResult.resultStatus);
          expect(findResult!.resultBody).toEqual(firstResult.resultBody);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('for all valid keys, a second store with different body still returns the original result (first-write-wins)', async () => {
    await fc.assert(
      fc.asyncProperty(
        idempotencyInputArb,
        resultBodyArb,
        async (input, differentBody) => {
          const { service, store } = createServiceWithInMemoryStore();

          // First store
          const firstResult = await service.store(
            input.key,
            input.operationType,
            input.resultStatus,
            input.resultBody,
          );

          // Second store with same key but different body
          const secondResult = await service.store(
            input.key,
            input.operationType,
            input.resultStatus,
            differentBody,
          );

          // The second call must return the ORIGINAL result (first-write-wins)
          expect(secondResult.resultStatus).toBe(firstResult.resultStatus);
          expect(secondResult.resultBody).toEqual(firstResult.resultBody);

          // Still only one record
          expect(store.size).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });
});
