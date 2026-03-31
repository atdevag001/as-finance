import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LoanRepository } from '../loan.repository';

/**
 * Unit tests for loan number generation (Task 3.7).
 *
 * Tests the `generateLoanNumber()` repository method which produces
 * sequential loan numbers in the format LN-{YYYY}-{NNNNN}.
 *
 * Validates: Requirements 65.1, 65.2, 65.4
 */

// ─── Mock Prisma Builder ────────────────────────────────────────────────────

function buildMockPrisma(sequenceValues: number[]) {
  let callIndex = 0;
  return {
    $queryRaw: vi.fn().mockImplementation(() => {
      const val = sequenceValues[callIndex] ?? sequenceValues[sequenceValues.length - 1]!;
      callIndex++;
      return Promise.resolve([{ nextval: BigInt(val) }]);
    }),
  };
}

describe('LoanRepository.generateLoanNumber', () => {
  const currentYear = new Date().getFullYear();

  // ─── Requirement 65.1: Format LN-{YYYY}-{NNNNN} ────────────────────────

  describe('format LN-{YYYY}-{NNNNN} (Req 65.1)', () => {
    it('produces a loan number matching the expected pattern', async () => {
      const prisma = buildMockPrisma([1]);
      const repo = new LoanRepository(prisma as any);

      const result = await repo.generateLoanNumber();

      expect(result).toMatch(/^LN-\d{4}-\d{5}$/);
    });

    it('zero-pads the sequence number to 5 digits for small values', async () => {
      const prisma = buildMockPrisma([1]);
      const repo = new LoanRepository(prisma as any);

      const result = await repo.generateLoanNumber();

      expect(result).toBe(`LN-${currentYear}-00001`);
    });

    it('zero-pads sequence number 42 to 00042', async () => {
      const prisma = buildMockPrisma([42]);
      const repo = new LoanRepository(prisma as any);

      const result = await repo.generateLoanNumber();

      expect(result).toBe(`LN-${currentYear}-00042`);
    });

    it('does not pad a 5-digit sequence number', async () => {
      const prisma = buildMockPrisma([99999]);
      const repo = new LoanRepository(prisma as any);

      const result = await repo.generateLoanNumber();

      expect(result).toBe(`LN-${currentYear}-99999`);
    });

    it('handles sequence numbers exceeding 5 digits (no truncation)', async () => {
      const prisma = buildMockPrisma([100000]);
      const repo = new LoanRepository(prisma as any);

      const result = await repo.generateLoanNumber();

      // padStart(5, '0') won't truncate — 6-digit number stays as-is
      expect(result).toBe(`LN-${currentYear}-100000`);
    });
  });

  // ─── Requirement 65.2: Sequential increase ──────────────────────────────

  describe('sequential increase (Req 65.2)', () => {
    it('produces strictly increasing sequence numbers on consecutive calls', async () => {
      const prisma = buildMockPrisma([1, 2, 3]);
      const repo = new LoanRepository(prisma as any);

      const num1 = await repo.generateLoanNumber();
      const num2 = await repo.generateLoanNumber();
      const num3 = await repo.generateLoanNumber();

      expect(num1).toBe(`LN-${currentYear}-00001`);
      expect(num2).toBe(`LN-${currentYear}-00002`);
      expect(num3).toBe(`LN-${currentYear}-00003`);

      // String comparison works for same-year, same-length numbers
      expect(num2 > num1).toBe(true);
      expect(num3 > num2).toBe(true);
    });

    it('calls the database sequence on each invocation', async () => {
      const prisma = buildMockPrisma([10, 11]);
      const repo = new LoanRepository(prisma as any);

      await repo.generateLoanNumber();
      await repo.generateLoanNumber();

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Requirement 65.4: Year prefix reflects current calendar year ───────

  describe('year prefix reflects current calendar year (Req 65.4)', () => {
    it('uses the current year in the loan number', async () => {
      const prisma = buildMockPrisma([1]);
      const repo = new LoanRepository(prisma as any);

      const result = await repo.generateLoanNumber();

      const yearPart = result.split('-')[1];
      expect(yearPart).toBe(String(currentYear));
    });

    it('reflects a different year when system clock changes', async () => {
      const prisma = buildMockPrisma([1, 2]);
      const repo = new LoanRepository(prisma as any);

      // First call: real current year
      const result1 = await repo.generateLoanNumber();
      expect(result1).toContain(`LN-${currentYear}-`);

      // Mock Date to simulate a different year
      const fakeYear = 2030;
      vi.useFakeTimers();
      vi.setSystemTime(new Date(`${fakeYear}-06-15T12:00:00Z`));

      const result2 = await repo.generateLoanNumber();
      expect(result2).toBe(`LN-${fakeYear}-00002`);

      vi.useRealTimers();
    });
  });
});
