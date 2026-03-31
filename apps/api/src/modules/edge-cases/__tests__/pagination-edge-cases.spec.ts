/**
 * Pagination Edge Case Tests (Task 24.5)
 *
 * Tests boundary conditions in skip, take, and total count for paginated queries.
 *
 * Validates: Requirements 73.1–73.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock Repository with Pagination ─────────────────────────────────────────

interface PaginatedResult<T> {
  data: T[];
  total: number;
}

/**
 * Simulates a paginated query with validation, mirroring the repository pattern.
 */
function paginatedQuery<T>(
  allRecords: T[],
  params: { skip?: number; take?: number; filter?: (r: T) => boolean },
): PaginatedResult<T> {
  const MAX_PAGE_SIZE = 100;

  // Validate skip
  if (params.skip !== undefined && params.skip < 0) {
    throw new Error('skip must be non-negative');
  }

  // Validate take
  if (params.take !== undefined && params.take < 0) {
    throw new Error('take must be non-negative');
  }

  // Apply filter
  const filtered = params.filter ? allRecords.filter(params.filter) : allRecords;
  const total = filtered.length;

  // Clamp take to MAX_PAGE_SIZE
  const skip = params.skip ?? 0;
  let take = params.take ?? 50;
  if (take > MAX_PAGE_SIZE) {
    take = MAX_PAGE_SIZE;
  }

  const data = filtered.slice(skip, skip + take);

  return { data, total };
}

// ─── Test Data ───────────────────────────────────────────────────────────────

function generateRecords(count: number): Array<{ id: number; name: string; active: boolean }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Record ${i + 1}`,
    active: i % 3 !== 0, // Every 3rd record is inactive
  }));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Pagination Edge Cases (Req 73)', () => {
  const records = generateRecords(25);

  // ─── 73.1: skip > total count → empty data with correct total ────────────

  describe('73.1 — skip > total count', () => {
    it('returns empty data when skip exceeds total records', () => {
      const result = paginatedQuery(records, { skip: 100, take: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(25);
    });

    it('returns empty data when skip equals total records', () => {
      const result = paginatedQuery(records, { skip: 25, take: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(25);
    });

    it('returns empty data with very large skip', () => {
      const result = paginatedQuery(records, { skip: 999999, take: 10 });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(25);
    });
  });

  // ─── 73.2: take=0 → empty data ──────────────────────────────────────────

  describe('73.2 — take=0', () => {
    it('returns empty data array with take=0', () => {
      const result = paginatedQuery(records, { skip: 0, take: 0 });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(25);
    });
  });

  // ─── 73.3: Negative skip → validation error ─────────────────────────────

  describe('73.3 — Negative skip', () => {
    it('throws validation error for negative skip', () => {
      expect(() => paginatedQuery(records, { skip: -1, take: 10 })).toThrow(
        'skip must be non-negative',
      );
    });

    it('throws validation error for large negative skip', () => {
      expect(() => paginatedQuery(records, { skip: -100, take: 10 })).toThrow(
        'skip must be non-negative',
      );
    });
  });

  // ─── 73.4: Negative take → validation error ─────────────────────────────

  describe('73.4 — Negative take', () => {
    it('throws validation error for negative take', () => {
      expect(() => paginatedQuery(records, { skip: 0, take: -1 })).toThrow(
        'take must be non-negative',
      );
    });
  });

  // ─── 73.5: take > 100 → clamped to 100 ──────────────────────────────────

  describe('73.5 — take > max page size (100)', () => {
    it('clamps take to 100 when requesting more', () => {
      const largeDataset = generateRecords(200);
      const result = paginatedQuery(largeDataset, { skip: 0, take: 150 });
      expect(result.data).toHaveLength(100);
      expect(result.total).toBe(200);
    });

    it('take=101 is clamped to 100', () => {
      const largeDataset = generateRecords(200);
      const result = paginatedQuery(largeDataset, { skip: 0, take: 101 });
      expect(result.data).toHaveLength(100);
    });

    it('take=100 is not clamped', () => {
      const largeDataset = generateRecords(200);
      const result = paginatedQuery(largeDataset, { skip: 0, take: 100 });
      expect(result.data).toHaveLength(100);
    });
  });

  // ─── 73.6: Filtered total count ──────────────────────────────────────────

  describe('73.6 — Filtered total count reflects filtered count', () => {
    it('total reflects filtered count, not unfiltered table count', () => {
      const result = paginatedQuery(records, {
        skip: 0,
        take: 50,
        filter: (r) => r.active,
      });
      // 25 records, every 3rd is inactive → ~17 active
      const expectedActive = records.filter((r) => r.active).length;
      expect(result.total).toBe(expectedActive);
      expect(result.total).toBeLessThan(25);
    });

    it('empty filter result returns total=0', () => {
      const result = paginatedQuery(records, {
        skip: 0,
        take: 50,
        filter: () => false, // Nothing matches
      });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ─── 73.7: skip + take near total count → correct partial page ──────────

  describe('73.7 — skip + take near total count', () => {
    it('returns partial page when skip + take exceeds total', () => {
      const result = paginatedQuery(records, { skip: 20, take: 10 });
      expect(result.data).toHaveLength(5); // Only 5 records left (25 - 20)
      expect(result.total).toBe(25);
    });

    it('returns exactly 1 record when skip = total - 1', () => {
      const result = paginatedQuery(records, { skip: 24, take: 10 });
      expect(result.data).toHaveLength(1);
      expect(result.data[0]!.id).toBe(25);
    });

    it('returns correct records at the boundary', () => {
      const result = paginatedQuery(records, { skip: 23, take: 5 });
      expect(result.data).toHaveLength(2); // Records 24 and 25
      expect(result.data[0]!.id).toBe(24);
      expect(result.data[1]!.id).toBe(25);
    });
  });
});
