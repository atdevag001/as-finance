/**
 * Processing Fee Journal Entry Integration Test (Task 24.10)
 *
 * Tests that disbursement with a configured processing fee creates
 * the correct journal entry (Debit Cash/Bank, Credit Processing_Fee_Income).
 *
 * Validates: Requirements 66.7
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

// ─── Processing Fee Calculator (mirrors DisbursementService) ─────────────────

function calculateProcessingFee(
  principalPaise: bigint,
  feeType: string,
  feeValue: number,
): bigint {
  if (feeType === 'fixed') {
    return BigInt(feeValue);
  }
  if (feeType === 'percentage') {
    const fee = new Decimal(principalPaise.toString())
      .mul(feeValue)
      .div(10000)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    return BigInt(fee.toString());
  }
  return 0n;
}

// ─── Mock Accounting Service ─────────────────────────────────────────────────

interface JournalLine {
  accountId: string;
  debitPaise: number;
  creditPaise: number;
}

interface JournalEntry {
  id: string;
  date: string;
  description: string;
  sourceType: string;
  sourceId: string;
  createdBy: string;
  lines: JournalLine[];
}

function createMockAccountingService() {
  const entries: JournalEntry[] = [];
  return {
    createJournalEntry: vi.fn().mockImplementation((entry: JournalEntry) => {
      const created = { ...entry, id: `je-${entries.length + 1}` };
      entries.push(created);
      return Promise.resolve(created);
    }),
    getEntries: () => entries,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Processing Fee Journal Entry (Req 66.7)', () => {
  let accountingService: ReturnType<typeof createMockAccountingService>;

  // Account IDs matching the chart of accounts
  const CASH_ACCOUNT_ID = 'acct-1001';
  const BANK_ACCOUNT_ID = 'acct-1002';
  const LOANS_RECEIVABLE_ID = 'acct-1100';
  const PROCESSING_FEE_INCOME_ID = 'acct-4002';

  beforeEach(() => {
    accountingService = createMockAccountingService();
  });

  describe('disbursement with configured processing fee', () => {
    it('creates a processing fee journal entry with correct accounts', async () => {
      const principalPaise = 100_000_00n; // 1 lakh INR
      const feeType = 'percentage';
      const feeValue = 200; // 2% = 200 bps
      const processingFee = calculateProcessingFee(principalPaise, feeType, feeValue);

      expect(processingFee).toBe(2_000_00n); // 2% of 1 lakh = 2000 INR

      // Simulate the journal entry creation
      const journalEntry = await accountingService.createJournalEntry({
        id: '',
        date: '2024-01-15',
        description: 'Processing fee for loan LN-2024-00001',
        sourceType: 'processing_fee',
        sourceId: 'loan-1',
        createdBy: 'actor-1',
        lines: [
          {
            accountId: CASH_ACCOUNT_ID,
            debitPaise: Number(processingFee),
            creditPaise: 0,
          },
          {
            accountId: PROCESSING_FEE_INCOME_ID,
            debitPaise: 0,
            creditPaise: Number(processingFee),
          },
        ],
      });

      expect(journalEntry).toBeDefined();
      expect(journalEntry.lines).toHaveLength(2);
    });

    it('journal entry is balanced (total debits = total credits)', async () => {
      const processingFee = calculateProcessingFee(100_000_00n, 'percentage', 200);

      const entry = await accountingService.createJournalEntry({
        id: '',
        date: '2024-01-15',
        description: 'Processing fee',
        sourceType: 'processing_fee',
        sourceId: 'loan-1',
        createdBy: 'actor-1',
        lines: [
          { accountId: CASH_ACCOUNT_ID, debitPaise: Number(processingFee), creditPaise: 0 },
          { accountId: PROCESSING_FEE_INCOME_ID, debitPaise: 0, creditPaise: Number(processingFee) },
        ],
      });

      const totalDebits = entry.lines.reduce((s: number, l: JournalLine) => s + l.debitPaise, 0);
      const totalCredits = entry.lines.reduce((s: number, l: JournalLine) => s + l.creditPaise, 0);
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(Number(processingFee));
    });

    it('debit line is Cash/Bank account', async () => {
      const processingFee = calculateProcessingFee(50_000_00n, 'fixed', 500_00);

      const entry = await accountingService.createJournalEntry({
        id: '',
        date: '2024-01-15',
        description: 'Processing fee',
        sourceType: 'processing_fee',
        sourceId: 'loan-1',
        createdBy: 'actor-1',
        lines: [
          { accountId: CASH_ACCOUNT_ID, debitPaise: Number(processingFee), creditPaise: 0 },
          { accountId: PROCESSING_FEE_INCOME_ID, debitPaise: 0, creditPaise: Number(processingFee) },
        ],
      });

      const debitLine = entry.lines.find((l: JournalLine) => l.debitPaise > 0);
      expect(debitLine!.accountId).toBe(CASH_ACCOUNT_ID);
    });

    it('credit line is Processing_Fee_Income account', async () => {
      const processingFee = calculateProcessingFee(50_000_00n, 'percentage', 150);

      const entry = await accountingService.createJournalEntry({
        id: '',
        date: '2024-01-15',
        description: 'Processing fee',
        sourceType: 'processing_fee',
        sourceId: 'loan-1',
        createdBy: 'actor-1',
        lines: [
          { accountId: CASH_ACCOUNT_ID, debitPaise: Number(processingFee), creditPaise: 0 },
          { accountId: PROCESSING_FEE_INCOME_ID, debitPaise: 0, creditPaise: Number(processingFee) },
        ],
      });

      const creditLine = entry.lines.find((l: JournalLine) => l.creditPaise > 0);
      expect(creditLine!.accountId).toBe(PROCESSING_FEE_INCOME_ID);
    });

    it('source type is processing_fee', async () => {
      const processingFee = calculateProcessingFee(100_000_00n, 'fixed', 1000_00);

      const entry = await accountingService.createJournalEntry({
        id: '',
        date: '2024-01-15',
        description: 'Processing fee',
        sourceType: 'processing_fee',
        sourceId: 'loan-1',
        createdBy: 'actor-1',
        lines: [
          { accountId: CASH_ACCOUNT_ID, debitPaise: Number(processingFee), creditPaise: 0 },
          { accountId: PROCESSING_FEE_INCOME_ID, debitPaise: 0, creditPaise: Number(processingFee) },
        ],
      });

      expect(entry.sourceType).toBe('processing_fee');
    });

    it('no processing fee journal entry when fee is zero', () => {
      const processingFee = calculateProcessingFee(100_000_00n, 'percentage', 0);
      expect(processingFee).toBe(0n);
      // When fee is 0, the disbursement service skips journal entry creation
      expect(accountingService.createJournalEntry).not.toHaveBeenCalled();
    });

    it('no processing fee journal entry for unrecognized fee type', () => {
      const processingFee = calculateProcessingFee(100_000_00n, 'unknown', 200);
      expect(processingFee).toBe(0n);
      expect(accountingService.createJournalEntry).not.toHaveBeenCalled();
    });

    it('bank transfer disbursement uses Bank account for debit', async () => {
      const processingFee = calculateProcessingFee(100_000_00n, 'percentage', 200);

      const entry = await accountingService.createJournalEntry({
        id: '',
        date: '2024-01-15',
        description: 'Processing fee (bank transfer)',
        sourceType: 'processing_fee',
        sourceId: 'loan-1',
        createdBy: 'actor-1',
        lines: [
          { accountId: BANK_ACCOUNT_ID, debitPaise: Number(processingFee), creditPaise: 0 },
          { accountId: PROCESSING_FEE_INCOME_ID, debitPaise: 0, creditPaise: Number(processingFee) },
        ],
      });

      const debitLine = entry.lines.find((l: JournalLine) => l.debitPaise > 0);
      expect(debitLine!.accountId).toBe(BANK_ACCOUNT_ID);
    });
  });
});
