import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { Prisma } from '@prisma/client';
import { IdempotencyService } from '../idempotency.service';
import type { PrismaService } from '../../../database/prisma.service';

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


/**
 * Property 35: Idempotence — storing same key twice returns original cached result (f(x) = f(f(x)))
 *
 * For any valid idempotency key, calling store() with the same key multiple
 * times always returns the result from the first invocation. The second and
 * subsequent calls never create new records and always return the cached
 * original. This is the formal idempotence property: f(x) = f(f(x)).
 *
 * **Validates: Requirements 36.1, 36.2, 36.3**
 */
describe('Property 35: Idempotence — storing same key twice returns original cached result (f(x) = f(f(x)))', () => {
  it('store(key) twice with identical inputs returns the original cached result both times', async () => {
    await fc.assert(
      fc.asyncProperty(idempotencyInputArb, async (input) => {
        const { service, store } = createServiceWithInMemoryStore();

        const first = await service.store(
          input.key,
          input.operationType,
          input.resultStatus,
          input.resultBody,
        );

        const second = await service.store(
          input.key,
          input.operationType,
          input.resultStatus,
          input.resultBody,
        );

        // f(x) = f(f(x))
        expect(second.resultStatus).toBe(first.resultStatus);
        expect(second.resultBody).toEqual(first.resultBody);

        // No duplicate records
        expect(store.size).toBe(1);
      }),
      { numRuns: 100 },
    );
  });

  it('store(key) with different body on second call still returns original (first-write-wins idempotence)', async () => {
    await fc.assert(
      fc.asyncProperty(
        idempotencyInputArb,
        resultBodyArb,
        resultStatusArb,
        async (input, altBody, altStatus) => {
          const { service, store } = createServiceWithInMemoryStore();

          const first = await service.store(
            input.key,
            input.operationType,
            input.resultStatus,
            input.resultBody,
          );

          // Second call with different body and status — must still return original
          const second = await service.store(
            input.key,
            input.operationType,
            altStatus,
            altBody,
          );

          expect(second.resultStatus).toBe(first.resultStatus);
          expect(second.resultBody).toEqual(first.resultBody);
          expect(store.size).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('f(x) = f^n(x) — repeated store calls (2–6 times) always return the first result', async () => {
    await fc.assert(
      fc.asyncProperty(
        idempotencyInputArb,
        fc.integer({ min: 2, max: 6 }),
        async (input, n) => {
          const { service, store } = createServiceWithInMemoryStore();

          const first = await service.store(
            input.key,
            input.operationType,
            input.resultStatus,
            input.resultBody,
          );

          for (let i = 1; i < n; i++) {
            const repeated = await service.store(
              input.key,
              input.operationType,
              input.resultStatus,
              input.resultBody,
            );
            expect(repeated.resultStatus).toBe(first.resultStatus);
            expect(repeated.resultBody).toEqual(first.resultBody);
          }

          // find() also returns the same cached result
          const found = await service.find(input.key);
          expect(found).not.toBeNull();
          expect(found!.resultStatus).toBe(first.resultStatus);
          expect(found!.resultBody).toEqual(first.resultBody);

          // Exactly one record in the store
          expect(store.size).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 36: Operation Independence — different operation types stored independently
 *
 * Idempotency keys for different operations (using distinct keys) are stored
 * and retrieved independently. Storing a key for one operation type does not
 * affect the ability to store and retrieve a key for a different operation
 * type. Each operation's cached result is isolated.
 *
 * **Validates: Requirements 36.1, 36.2, 36.3**
 */
describe('Property 36: Operation Independence — different operation types stored independently', () => {
  it('keys for different operation types are stored and retrieved independently', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(
          fc.record({
            key: idempotencyKeyArb,
            operationType: operationTypeArb,
            resultStatus: resultStatusArb,
            resultBody: resultBodyArb,
          }),
          { minLength: 2, maxLength: 5, comparator: (a, b) => a.key === b.key },
        ),
        async (entries) => {
          const { service, store } = createServiceWithInMemoryStore();

          // Store all entries (each with a unique key)
          const results: Array<{ resultStatus: number; resultBody: unknown }> = [];
          for (const entry of entries) {
            const result = await service.store(
              entry.key,
              entry.operationType,
              entry.resultStatus,
              entry.resultBody,
            );
            results.push(result);
          }

          // Each entry should be independently retrievable
          for (let i = 0; i < entries.length; i++) {
            const found = await service.find(entries[i]!.key);
            expect(found).not.toBeNull();
            expect(found!.resultStatus).toBe(entries[i]!.resultStatus);
            expect(found!.resultBody).toEqual(entries[i]!.resultBody);
          }

          // Total records = number of unique keys
          expect(store.size).toBe(entries.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('storing entries for different operation types does not overwrite each other', async () => {
    await fc.assert(
      fc.asyncProperty(
        resultStatusArb,
        resultBodyArb,
        resultBodyArb,
        async (status, bodyA, bodyB) => {
          const { service } = createServiceWithInMemoryStore();

          // Two different keys for two different operation types
          const keyA = `op-a-${crypto.randomUUID()}`;
          const keyB = `op-b-${crypto.randomUUID()}`;

          const resultA = await service.store(keyA, 'collection', status, bodyA);
          const resultB = await service.store(keyB, 'disbursement', status, bodyB);

          // Each find returns its own result, not the other's
          const foundA = await service.find(keyA);
          const foundB = await service.find(keyB);

          expect(foundA).not.toBeNull();
          expect(foundA!.resultStatus).toBe(resultA.resultStatus);
          expect(foundA!.resultBody).toEqual(bodyA);

          expect(foundB).not.toBeNull();
          expect(foundB!.resultStatus).toBe(resultB.resultStatus);
          expect(foundB!.resultBody).toEqual(bodyB);

          // They are distinct
          if (JSON.stringify(bodyA) !== JSON.stringify(bodyB)) {
            expect(foundA!.resultBody).not.toEqual(foundB!.resultBody);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all four operation types can coexist without interference', async () => {
    await fc.assert(
      fc.asyncProperty(
        resultStatusArb,
        fc.array(resultBodyArb, { minLength: 4, maxLength: 4 }),
        async (status, bodies) => {
          const { service, store } = createServiceWithInMemoryStore();

          const opTypes = ['collection', 'disbursement', 'reversal', 'penalty'] as const;
          const keys = opTypes.map((op) => `${op}-${crypto.randomUUID()}`);

          // Store one entry per operation type
          const storedResults: Array<{ resultStatus: number; resultBody: unknown }> = [];
          for (let i = 0; i < opTypes.length; i++) {
            const result = await service.store(keys[i]!, opTypes[i], status, bodies[i]);
            storedResults.push(result);
          }

          expect(store.size).toBe(4);

          // Each entry is independently retrievable with correct data
          for (let i = 0; i < opTypes.length; i++) {
            const found = await service.find(keys[i]!);
            expect(found).not.toBeNull();
            expect(found!.resultStatus).toBe(status);
            expect(found!.resultBody).toEqual(bodies[i]);
          }

          // Verify operation_type is correctly stored
          for (let i = 0; i < opTypes.length; i++) {
            const record = store.get(keys[i]!);
            expect(record).toBeDefined();
            expect(record!.operation_type).toBe(opTypes[i]);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
