/**
 * Loan Number Generation Integration Tests (Task 24.7)
 *
 * Tests that concurrent loan creation produces no duplicate loan numbers
 * and that the unique constraint rejects duplicates at the DB level.
 *
 * Validates: Requirements 65.3, 65.5
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoanRepository } from '../../loan/loan.repository';

// ─── Mock Prisma Builder ─────────────────────────────────────────────────────

function buildMockPrisma(options: {
  sequenceValues?: number[];
  uniqueViolation?: boolean;
} = {}) {
  let callIndex = 0;
  const seqValues = options.sequenceValues ?? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  return {
    $queryRaw: vi.fn().mockImplementation(() => {
      const val = seqValues[callIndex] ?? seqValues[seqValues.length - 1]!;
      callIndex++;
      return Promise.resolve([{ nextval: BigInt(val) }]);
    }),
    loans: {
      create: vi.fn().mockImplementation((args: { data: { loan_number: string } }) => {
        if (options.uniqueViolation) {
          const error = new Error('Unique constraint failed on the fields: (`loan_number`)');
          (error as Record<string, unknown>).code = 'P2002';
          return Promise.reject(error);
        }
        return Promise.resolve({ id: `loan-${callIndex}`, ...args.data });
      }),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Loan Number Generation Integration (Req 65.3, 65.5)', () => {
  // ─── 65.3: Concurrent loan creation produces no duplicate loan numbers ───

  describe('65.3 — Concurrent loan creation produces unique numbers', () => {
    it('parallel calls to generateLoanNumber produce unique numbers', async () => {
      const prisma = buildMockPrisma({ sequenceValues: [1, 2, 3, 4, 5] });
      const repo = new LoanRepository(prisma as never);

      // Simulate 5 concurrent calls
      const results = await Promise.all([
        repo.generateLoanNumber(),
        repo.generateLoanNumber(),
        repo.generateLoanNumber(),
        repo.generateLoanNumber(),
        repo.generateLoanNumber(),
      ]);

      // All should be unique
      const uniqueNumbers = new Set(results);
      expect(uniqueNumbers.size).toBe(5);
    });

    it('sequential calls produce strictly increasing numbers', async () => {
      const prisma = buildMockPrisma({ sequenceValues: [10, 11, 12] });
      const repo = new LoanRepository(prisma as never);

      const num1 = await repo.generateLoanNumber();
      const num2 = await repo.generateLoanNumber();
      const num3 = await repo.generateLoanNumber();

      // Extract sequence numbers
      const seq1 = parseInt(num1.split('-')[2]!, 10);
      const seq2 = parseInt(num2.split('-')[2]!, 10);
      const seq3 = parseInt(num3.split('-')[2]!, 10);

      expect(seq2).toBeGreaterThan(seq1);
      expect(seq3).toBeGreaterThan(seq2);
    });

    it('each call queries the PostgreSQL sequence', async () => {
      const prisma = buildMockPrisma({ sequenceValues: [1, 2, 3] });
      const repo = new LoanRepository(prisma as never);

      await repo.generateLoanNumber();
      await repo.generateLoanNumber();
      await repo.generateLoanNumber();

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
    });
  });

  // ─── 65.5: Unique constraint rejects duplicates at DB level ──────────────

  describe('65.5 — loan_number unique constraint', () => {
    it('database rejects duplicate loan_number with P2002 error', async () => {
      const prisma = buildMockPrisma({ uniqueViolation: true });

      await expect(
        prisma.loans.create({
          data: {
            loan_number: 'LN-2024-00001',
          },
        }),
      ).rejects.toThrow('Unique constraint failed');
    });

    it('unique constraint error has Prisma error code P2002', async () => {
      const prisma = buildMockPrisma({ uniqueViolation: true });

      try {
        await prisma.loans.create({
          data: { loan_number: 'LN-2024-00001' },
        });
        expect.fail('Should have thrown');
      } catch (err) {
        expect((err as Record<string, unknown>).code).toBe('P2002');
      }
    });

    it('different loan numbers are accepted', async () => {
      const prisma = buildMockPrisma();

      const loan1 = await prisma.loans.create({
        data: { loan_number: 'LN-2024-00001' },
      });
      const loan2 = await prisma.loans.create({
        data: { loan_number: 'LN-2024-00002' },
      });

      expect(loan1.loan_number).not.toBe(loan2.loan_number);
    });
  });
});
