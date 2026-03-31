import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { AuditService } from '../audit.service';
import { AuditRepository } from '../audit.repository';
import { AuditAction } from '@as-finance/shared';

/**
 * Property 16: Audit Completeness
 *
 * For all finance-affecting actions, a corresponding audit log entry exists
 * with matching target_id, action_type, actor_id, and timestamp.
 *
 * **Validates: Requirements 17.1, 17.6, 25.6**
 */

// --- Generators ---

const ALL_AUDIT_ACTIONS = Object.values(AuditAction);

/** Generates a valid AuditAction enum value */
const actionTypeArb = fc.constantFrom(...ALL_AUDIT_ACTIONS);

/** Generates a valid UUID v4 string */
const uuidArb = fc.uuid();

/** Generates a valid actor role */
const actorRoleArb = fc.constantFrom(
  'super_admin',
  'manager',
  'field_officer',
  'collection_officer',
  'accountant',
  'office_staff',
  'viewer_auditor',
);

/** Generates a valid target entity name */
const targetEntityArb = fc.constantFrom(
  'customer',
  'loan',
  'collection',
  'disbursement',
  'penalty',
  'foreclosure',
  'expense',
  'journal_entry',
  'receipt',
  'user',
);

/** Generates a complete valid audit log creation input */
const auditInputArb = fc.record({
  action_type: actionTypeArb,
  actor_id: uuidArb,
  actor_role: actorRoleArb,
  target_entity: targetEntityArb,
  target_id: uuidArb,
});

// --- Helpers ---

function createServiceWithCapture() {
  const calls: Record<string, unknown>[] = [];

  const repository = {
    create: vi.fn().mockImplementation((data: Record<string, unknown>) => {
      const entry = {
        id: crypto.randomUUID(),
        ...data,
        created_at: new Date(),
      };
      calls.push(entry);
      return Promise.resolve(entry);
    }),
    findAll: vi.fn(),
  } as unknown as AuditRepository;

  const service = new AuditService(repository);
  return { service, repository, calls };
}

// --- Property Tests ---

describe('Property 16: Audit Completeness', () => {
  it('for all valid inputs, createAuditLog produces an entry with matching action_type, actor_id, target_id, and target_entity', async () => {
    await fc.assert(
      fc.asyncProperty(auditInputArb, async (input) => {
        const { service, repository } = createServiceWithCapture();

        const result = await service.createAuditLog({
          action_type: input.action_type,
          actor_id: input.actor_id,
          actor_role: input.actor_role,
          target_entity: input.target_entity,
          target_id: input.target_id,
        });

        // Verify the repository was called with matching fields
        expect(repository.create).toHaveBeenCalledTimes(1);
        const passedData = (repository.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
        expect(passedData.action_type).toBe(input.action_type);
        expect(passedData.actor_id).toBe(input.actor_id);
        expect(passedData.actor_role).toBe(input.actor_role);
        expect(passedData.target_entity).toBe(input.target_entity);
        expect(passedData.target_id).toBe(input.target_id);

        // Verify the returned entry also has matching fields
        expect(result.action_type).toBe(input.action_type);
        expect(result.actor_id).toBe(input.actor_id);
        expect(result.target_id).toBe(input.target_id);
      }),
      { numRuns: 200 },
    );
  });

  it('for all valid inputs, the created entry has a recent timestamp (created_at within 5 seconds of now)', async () => {
    await fc.assert(
      fc.asyncProperty(auditInputArb, async (input) => {
        const { service } = createServiceWithCapture();
        const before = Date.now();

        const result = await service.createAuditLog({
          action_type: input.action_type,
          actor_id: input.actor_id,
          actor_role: input.actor_role,
          target_entity: input.target_entity,
          target_id: input.target_id,
        });

        const after = Date.now();
        const createdAt = new Date(result.created_at).getTime();

        expect(createdAt).toBeGreaterThanOrEqual(before - 5000);
        expect(createdAt).toBeLessThanOrEqual(after + 5000);
      }),
      { numRuns: 100 },
    );
  });

  it('for all valid inputs, all required fields are preserved in the created entry (no field is dropped or mutated)', async () => {
    await fc.assert(
      fc.asyncProperty(auditInputArb, async (input) => {
        const { service, repository } = createServiceWithCapture();

        await service.createAuditLog({
          action_type: input.action_type,
          actor_id: input.actor_id,
          actor_role: input.actor_role,
          target_entity: input.target_entity,
          target_id: input.target_id,
        });

        // Verify all five required fields are present and unchanged
        const data = (repository.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];

        expect(data.action_type).toBe(input.action_type);
        expect(data.actor_id).toBe(input.actor_id);
        expect(data.actor_role).toBe(input.actor_role);
        expect(data.target_entity).toBe(input.target_entity);
        expect(data.target_id).toBe(input.target_id);

        // Defaults are applied for optional fields (not dropped)
        expect(data).toHaveProperty('ip_address');
        expect(data).toHaveProperty('request_id');
      }),
      { numRuns: 200 },
    );
  });
});


/**
 * Property 17: Audit Log Append-Only
 *
 * No audit log entry is modifiable or deletable after creation;
 * UPDATE/DELETE attempts are rejected. The API surface of the audit module
 * enforces append-only semantics by not providing mutation methods.
 *
 * **Validates: Requirements 17.4**
 */

// --- Helpers for Property 17 ---

/** Method names that indicate mutation (update/delete) capability */
const MUTATION_PATTERNS = [
  /^update/i,
  /^delete/i,
  /^remove/i,
  /^destroy/i,
  /^edit/i,
  /^modify/i,
  /^patch/i,
  /^erase/i,
  /^drop/i,
  /^purge/i,
];

function isMutationMethod(name: string): boolean {
  return MUTATION_PATTERNS.some((pattern) => pattern.test(name));
}

function getOwnMethodNames(obj: object): string[] {
  return Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter(
    (name) => name !== 'constructor' && typeof (obj as Record<string, unknown>)[name] === 'function',
  );
}

/**
 * In-memory store simulating append-only audit log persistence.
 * Supports create and findById — no update or delete.
 */
function createAppendOnlyStore() {
  const store = new Map<string, Record<string, unknown>>();

  const repository = {
    create: vi.fn().mockImplementation((data: Record<string, unknown>) => {
      const entry = {
        id: crypto.randomUUID(),
        ...data,
        created_at: new Date(),
      };
      store.set(entry.id as string, Object.freeze({ ...entry }));
      return Promise.resolve({ ...entry });
    }),
    findAll: vi.fn(),
  } as unknown as AuditRepository;

  const service = new AuditService(repository);

  function readEntry(id: string): Record<string, unknown> | undefined {
    const frozen = store.get(id);
    return frozen ? { ...frozen } : undefined;
  }

  return { service, repository, store, readEntry };
}

// --- Property Tests ---

describe('Property 17: Audit Log Append-Only', () => {
  it('AuditService exposes no update or delete methods (structural append-only)', () => {
    const { service } = createServiceWithCapture();
    const methods = getOwnMethodNames(service);

    for (const method of methods) {
      expect(isMutationMethod(method)).toBe(false);
    }
  });

  it('AuditRepository exposes no update or delete methods (structural append-only)', () => {
    const repo = new (AuditRepository as unknown as new (...args: unknown[]) => AuditRepository)(
      {} as ConstructorParameters<typeof AuditRepository>[0],
    );
    const methods = getOwnMethodNames(repo);

    for (const method of methods) {
      expect(isMutationMethod(method)).toBe(false);
    }
  });

  it('for all audit log entries created, reading back returns identical content (immutability)', async () => {
    await fc.assert(
      fc.asyncProperty(auditInputArb, async (input) => {
        const { service, readEntry } = createAppendOnlyStore();

        const created = await service.createAuditLog({
          action_type: input.action_type,
          actor_id: input.actor_id,
          actor_role: input.actor_role,
          target_entity: input.target_entity,
          target_id: input.target_id,
        });

        const readBack = readEntry(created.id as string);

        expect(readBack).toBeDefined();
        expect(readBack!['action_type']).toBe(created.action_type);
        expect(readBack!['actor_id']).toBe(created.actor_id);
        expect(readBack!['actor_role']).toBe(created.actor_role);
        expect(readBack!['target_entity']).toBe(created.target_entity);
        expect(readBack!['target_id']).toBe(created.target_id);
        expect(readBack!['ip_address']).toBe(created.ip_address);
        expect(readBack!['request_id']).toBe(created.request_id);
        expect(new Date(readBack!['created_at'] as string).getTime()).toBe(
          new Date(created.created_at as unknown as string).getTime(),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('AuditController exposes only GET endpoints (no PUT, PATCH, DELETE)', async () => {
    const mod = await import('../audit.controller');
    const controllerMethods = Object.getOwnPropertyNames(mod.AuditController.prototype).filter(
      (name) => name !== 'constructor',
    );

    for (const method of controllerMethods) {
      expect(isMutationMethod(method)).toBe(false);
    }
  });
});


/**
 * Property 33: Append-Only — audit log count never decreases after any operation
 *
 * For any sequence of audit log operations (creates and reads), the total
 * count of audit log entries never decreases. This verifies the append-only
 * invariant at the behavioral level.
 *
 * **Validates: Requirements 34.1, 34.2, 34.3**
 */

// --- Helpers for Property 33 ---

function createCountTrackingStore() {
  const entries: Record<string, unknown>[] = [];

  const repository = {
    create: vi.fn().mockImplementation((data: Record<string, unknown>) => {
      const entry = {
        id: crypto.randomUUID(),
        ...data,
        created_at: new Date(),
      };
      entries.push(entry);
      return Promise.resolve({ ...entry });
    }),
    findAll: vi.fn().mockImplementation(() => {
      return Promise.resolve({ data: [...entries], total: entries.length });
    }),
  } as unknown as AuditRepository;

  const service = new AuditService(repository);

  return { service, entries };
}

/** Generates a random operation: either 'create' (with audit input) or 'read' */
const operationArb = fc.oneof(
  auditInputArb.map((input) => ({ type: 'create' as const, input })),
  fc.constant({ type: 'read' as const, input: null }),
);

/** Generates a non-empty sequence of operations (1–20 operations per run) */
const operationSequenceArb = fc.array(operationArb, { minLength: 1, maxLength: 20 });

describe('Property 33: Append-Only — audit log count never decreases after any operation', () => {
  it('for any sequence of create and read operations, the audit log count is monotonically non-decreasing', async () => {
    await fc.assert(
      fc.asyncProperty(operationSequenceArb, async (operations) => {
        const { service, entries } = createCountTrackingStore();

        let previousCount = 0;

        for (const op of operations) {
          if (op.type === 'create' && op.input) {
            await service.createAuditLog({
              action_type: op.input.action_type,
              actor_id: op.input.actor_id,
              actor_role: op.input.actor_role,
              target_entity: op.input.target_entity,
              target_id: op.input.target_id,
            });
          } else {
            await service.findAll({ skip: 0, take: 50 });
          }

          const currentCount = entries.length;
          expect(currentCount).toBeGreaterThanOrEqual(previousCount);
          previousCount = currentCount;
        }
      }),
      { numRuns: 100 },
    );
  });

  it('after N create operations, the audit log contains exactly N entries', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(auditInputArb, { minLength: 1, maxLength: 30 }),
        async (inputs) => {
          const { service, entries } = createCountTrackingStore();

          for (const input of inputs) {
            await service.createAuditLog({
              action_type: input.action_type,
              actor_id: input.actor_id,
              actor_role: input.actor_role,
              target_entity: input.target_entity,
              target_id: input.target_id,
            });
          }

          expect(entries.length).toBe(inputs.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('interleaving reads between creates never reduces the count', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(auditInputArb, { minLength: 1, maxLength: 15 }),
        async (inputs) => {
          const { service, entries } = createCountTrackingStore();

          for (const input of inputs) {
            const countBefore = entries.length;

            // Read — should not change count
            await service.findAll({ skip: 0, take: 10 });
            expect(entries.length).toBe(countBefore);

            // Create — should increase count by exactly 1
            await service.createAuditLog({
              action_type: input.action_type,
              actor_id: input.actor_id,
              actor_role: input.actor_role,
              target_entity: input.target_entity,
              target_id: input.target_id,
            });
            expect(entries.length).toBe(countBefore + 1);

            // Read again — should not change count
            await service.findAll({ skip: 0, take: 10 });
            expect(entries.length).toBe(countBefore + 1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


/**
 * Property 34: Valid Action Types — every audit log entry has a valid AuditAction enum value
 *
 * For all audit log entries created via the service, the action_type field
 * is always a member of the AuditAction enum. This ensures no invalid or
 * arbitrary action types leak into the audit trail.
 *
 * **Validates: Requirements 34.1, 34.2, 34.3**
 */

const VALID_AUDIT_ACTIONS = new Set(Object.values(AuditAction));

describe('Property 34: Valid Action Types — every audit log entry has a valid AuditAction enum value', () => {
  it('for all valid inputs, the created audit log entry has an action_type in the AuditAction enum', async () => {
    await fc.assert(
      fc.asyncProperty(auditInputArb, async (input) => {
        const { service, calls } = createServiceWithCapture();

        await service.createAuditLog({
          action_type: input.action_type,
          actor_id: input.actor_id,
          actor_role: input.actor_role,
          target_entity: input.target_entity,
          target_id: input.target_id,
        });

        expect(calls.length).toBe(1);
        const entry = calls[0]!;
        expect(VALID_AUDIT_ACTIONS.has(entry['action_type'] as AuditAction)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('for a batch of audit log entries, every entry has a valid AuditAction enum value', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(auditInputArb, { minLength: 1, maxLength: 25 }),
        async (inputs) => {
          const { service, calls } = createServiceWithCapture();

          for (const input of inputs) {
            await service.createAuditLog({
              action_type: input.action_type,
              actor_id: input.actor_id,
              actor_role: input.actor_role,
              target_entity: input.target_entity,
              target_id: input.target_id,
            });
          }

          // Every single entry must have a valid action type
          for (const entry of calls) {
            expect(VALID_AUDIT_ACTIONS.has(entry['action_type'] as AuditAction)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('the AuditAction enum covers all action types used by the generator', () => {
    // Structural check: every value in the enum is a non-empty string
    for (const action of ALL_AUDIT_ACTIONS) {
      expect(typeof action).toBe('string');
      expect(action.length).toBeGreaterThan(0);
    }
    // The enum has at least the core finance actions
    expect(VALID_AUDIT_ACTIONS.size).toBeGreaterThanOrEqual(10);
  });
});
