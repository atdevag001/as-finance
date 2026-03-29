/**
 * Cleanup Utilities for E2E Tests
 *
 * Tracks entities created during tests and deletes them in reverse FK
 * dependency order. Entities are grouped by suite ID so individual suites
 * can clean up after themselves, or cleanupAll can wipe everything.
 *
 * The PrismaClient instance is retrieved from globalThis.__PRISMA_CLIENT__
 * (set during global setup).
 */

import { PrismaClient } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrackedEntity {
  table: string;
  id: string;
}

export interface CleanupUtils {
  /** Delete all tracked entities across every suite. */
  cleanupAll(): Promise<void>;
  /** Delete all tracked entities for a specific suite. */
  cleanupSuite(suiteId: string): Promise<void>;
  /** Track an entity for later cleanup. Defaults to the '__global__' suite. */
  track(entity: TrackedEntity, suiteId?: string): void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Tables ordered from leaf (no dependents) to root (most dependents).
 * Deleting in this order respects foreign key constraints.
 *
 * Self-referential tables (collections, receipts) need special handling —
 * nullable self-FKs are nullified before deletion.
 */
const DELETE_ORDER: readonly string[] = [
  // Leaf tables — no other table references these
  'outbox_messages',
  'audit_logs',
  'idempotency_keys',
  'cash_handover_records',
  'cash_transactions',
  'overdue_entries',
  'collection_allocations',
  'journal_lines',
  // Tables with self-referential FKs (handled specially)
  'receipts',
  'collections',
  // Mid-level tables
  'foreclosures',
  'penalties',
  'expenses',
  'disbursements',
  'journal_entries',
  'loan_schedules',
  'loan_status_history',
  'loan_approvals',
  'group_collections',
  'group_members',
  // Core entity tables
  'loans',
  'groups',
  'customer_documents',
  'family_members',
  'guarantors',
  'customers',
  'file_metadata',
  'loan_product_versions',
  'loan_products',
  'refresh_tokens',
  'user_area_assignments',
  'users',
  'settings',
  'chart_of_accounts',
];

/**
 * Tables with self-referential nullable FKs that must be nullified before
 * the rows can be deleted.
 */
const SELF_REF_NULLIFY: Record<string, string[]> = {
  receipts: ['compensating_receipt_id', 'original_receipt_id'],
  collections: ['original_collection_id'],
};

// ─── Implementation ──────────────────────────────────────────────────────────

function getPrisma(): PrismaClient {
  const prisma = (globalThis as Record<string, unknown>)[
    '__PRISMA_CLIENT__'
  ] as PrismaClient | undefined;

  if (!prisma) {
    throw new Error(
      'No PrismaClient available. Ensure global setup has run.',
    );
  }
  return prisma;
}

/**
 * Create a CleanupUtils instance.
 *
 * Tracked entities are stored in an in-memory map keyed by suite ID.
 * The special suite `__global__` is used when no suite ID is provided.
 */
export function createCleanupUtils(): CleanupUtils {
  /** suiteId → table → Set<id> */
  const registry = new Map<string, Map<string, Set<string>>>();

  function ensureSuite(suiteId: string): Map<string, Set<string>> {
    let suite = registry.get(suiteId);
    if (!suite) {
      suite = new Map();
      registry.set(suiteId, suite);
    }
    return suite;
  }

  function ensureTable(
    suite: Map<string, Set<string>>,
    table: string,
  ): Set<string> {
    let ids = suite.get(table);
    if (!ids) {
      ids = new Set();
      suite.set(table, ids);
    }
    return ids;
  }

  /**
   * Delete a batch of IDs from a single table, handling self-referential
   * FKs and falling back gracefully on missing tables.
   */
  async function deleteFromTable(
    prisma: PrismaClient,
    table: string,
    ids: string[],
  ): Promise<void> {
    if (ids.length === 0) return;

    const delegate = (prisma as unknown as Record<string, unknown>)[table] as
      | {
          updateMany?: (args: unknown) => Promise<unknown>;
          deleteMany?: (args: unknown) => Promise<unknown>;
        }
      | undefined;

    if (!delegate?.deleteMany) {
      // Table not in Prisma schema — skip silently
      return;
    }

    // Nullify self-referential FKs first
    const selfRefs = SELF_REF_NULLIFY[table];
    if (selfRefs && delegate.updateMany) {
      const data: Record<string, null> = {};
      for (const col of selfRefs) {
        data[col] = null;
      }
      await delegate.updateMany({
        where: { id: { in: ids } },
        data,
      });
    }

    await delegate.deleteMany({ where: { id: { in: ids } } });
  }

  /**
   * Delete all tracked entities for the given suite maps, in FK-safe order.
   */
  async function deleteTracked(
    suites: Map<string, Set<string>>[],
  ): Promise<void> {
    const prisma = getPrisma();

    // Merge all suites into a single table → ids map
    const merged = new Map<string, Set<string>>();
    for (const suite of suites) {
      for (const [table, ids] of suite) {
        let existing = merged.get(table);
        if (!existing) {
          existing = new Set();
          merged.set(table, existing);
        }
        for (const id of ids) {
          existing.add(id);
        }
      }
    }

    // Delete in the defined FK-safe order
    for (const table of DELETE_ORDER) {
      const ids = merged.get(table);
      if (ids && ids.size > 0) {
        await deleteFromTable(prisma, table, [...ids]);
      }
    }

    // Handle any tables not in DELETE_ORDER (safety net)
    for (const [table, ids] of merged) {
      if (!DELETE_ORDER.includes(table) && ids.size > 0) {
        await deleteFromTable(prisma, table, [...ids]);
      }
    }
  }

  return {
    track(entity: TrackedEntity, suiteId = '__global__'): void {
      const suite = ensureSuite(suiteId);
      const ids = ensureTable(suite, entity.table);
      ids.add(entity.id);
    },

    async cleanupSuite(suiteId: string): Promise<void> {
      const suite = registry.get(suiteId);
      if (!suite) return;

      await deleteTracked([suite]);
      registry.delete(suiteId);
    },

    async cleanupAll(): Promise<void> {
      const allSuites = [...registry.values()];
      if (allSuites.length === 0) return;

      await deleteTracked(allSuites);
      registry.clear();
    },
  };
}
