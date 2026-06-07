import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { AccountingService } from '../accounting.service';
import { AccountingRepository } from '../accounting.repository';
import { CreateJournalEntryDto, type JournalLineDto } from '../dto/create-journal-entry.dto';
import { JournalSourceType } from '@as-finance/shared';
import { BusinessRuleError } from '../../../common/errors';
import { journalEntryArb } from '@as-finance/testing';

// ---------------------------------------------------------------------------
// Shared generators
// ---------------------------------------------------------------------------

const ALL_SOURCE_TYPES = Object.values(JournalSourceType);

const uuidArb = fc.uuid();
const sourceTypeArb = fc.constantFrom(...ALL_SOURCE_TYPES);
const dateStrArb = fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
  .map((d) => d.toISOString().split('T')[0]);

/**
 * Generates a positive integer amount in paise (1 – 100_000_000).
 * Covers small, medium, and large amounts.
 */
const amountArb = fc.integer({ min: 1, max: 100_000_000 });

/**
 * Generates a balanced set of journal lines.
 * Strategy: generate N debit lines and N credit lines, then adjust the last
 * credit line so total debits == total credits exactly.
 */
const balancedLinesArb = fc
  .tuple(
    fc.array(fc.tuple(uuidArb, amountArb), { minLength: 1, maxLength: 5 }),
    fc.array(fc.tuple(uuidArb, amountArb), { minLength: 1, maxLength: 5 }),
  )
  .map(([debitPairs, creditPairs]): JournalLineDto[] => {
    const debitLines: JournalLineDto[] = debitPairs.map(([accountId, amount]) => ({
      accountId,
      debitPaise: amount,
      creditPaise: 0,
    }));

    const totalDebit = debitPairs.reduce((s, [, a]) => s + a, 0);

    // Build credit lines; adjust last one to balance
    const creditLines: JournalLineDto[] = creditPairs.map(([accountId, amount]) => ({
      accountId,
      debitPaise: 0,
      creditPaise: amount,
    }));

    const rawCreditTotal = creditPairs.reduce((s, [, a]) => s + a, 0);
    const diff = totalDebit - rawCreditTotal;

    // Adjust last credit line to balance
    const lastCredit = creditLines[creditLines.length - 1]!;
    const adjusted = lastCredit.creditPaise + diff;
    if (adjusted <= 0) {
      // If adjustment makes it non-positive, set last credit to totalDebit and
      // zero out all other credit lines
      for (let i = 0; i < creditLines.length - 1; i++) {
        creditLines[i]!.creditPaise = 0;
      }
      creditLines[creditLines.length - 1]!.creditPaise = totalDebit;
    } else {
      creditLines[creditLines.length - 1]!.creditPaise = adjusted;
    }

    // Filter out zero-amount lines (service rejects them)
    return [...debitLines, ...creditLines].filter(
      (l) => l.debitPaise > 0 || l.creditPaise > 0,
    );
  })
  // Ensure we still have at least 2 lines (1 debit + 1 credit)
  .filter((lines) => {
    const hasDebit = lines.some((l) => l.debitPaise > 0);
    const hasCredit = lines.some((l) => l.creditPaise > 0);
    return hasDebit && hasCredit && lines.length >= 2;
  });

/**
 * Generates a deliberately unbalanced set of journal lines.
 */
const unbalancedLinesArb = fc
  .tuple(uuidArb, uuidArb, amountArb, amountArb)
  .filter(([, , debit, credit]) => debit !== credit)
  .map(([accA, accB, debit, credit]): JournalLineDto[] => [
    { accountId: accA, debitPaise: debit, creditPaise: 0 },
    { accountId: accB, debitPaise: 0, creditPaise: credit },
  ]);

/** Generates a complete balanced CreateJournalEntryDto */
const balancedDtoArb = fc
  .tuple(dateStrArb, fc.string({ minLength: 1, maxLength: 100 }), sourceTypeArb, uuidArb, uuidArb, balancedLinesArb)
  .map(([date, description, sourceType, sourceId, createdBy, lines]): CreateJournalEntryDto => {
    const dto = new CreateJournalEntryDto();
    dto.date = date!;
    dto.description = description;
    dto.sourceType = sourceType;
    dto.sourceId = sourceId;
    dto.createdBy = createdBy;
    dto.lines = lines;
    return dto;
  });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Method names that indicate mutation (update/delete) capability */
const MUTATION_PATTERNS = [
  /^update/i, /^delete/i, /^remove/i, /^destroy/i,
  /^edit/i, /^modify/i, /^patch/i, /^erase/i, /^drop/i, /^purge/i,
];

function isMutationMethod(name: string): boolean {
  return MUTATION_PATTERNS.some((p) => p.test(name));
}

function getOwnMethodNames(obj: object): string[] {
  return Object.getOwnPropertyNames(Object.getPrototypeOf(obj)).filter(
    (n) => n !== 'constructor' && typeof (obj as Record<string, unknown>)[n] === 'function',
  );
}

/** Creates an AccountingService with a mock repository that captures calls */
function createServiceWithCapture() {
  const entries: Record<string, unknown>[] = [];

  const repo = {
    createJournalEntry: vi.fn().mockImplementation((data: Record<string, unknown>) => {
      const entry = { id: crypto.randomUUID(), ...data, created_at: new Date() };
      entries.push(entry);
      return Promise.resolve(entry);
    }),
    findAllAccounts: vi.fn().mockResolvedValue([]),
    findAccountById: vi.fn(),
    findAccountByCode: vi.fn(),
    findJournalEntriesByDateRange: vi.fn().mockResolvedValue([]),
    findJournalEntries: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    getAccountBalances: vi.fn().mockResolvedValue([]),
    getAccountTotalsForRange: vi.fn().mockResolvedValue([]),
    getAccountTotalsUpTo: vi.fn().mockResolvedValue([]),
  } as unknown as AccountingRepository;

  const prismaMock = {
    accounting_periods: { findUnique: vi.fn().mockResolvedValue(null) },
    chart_of_accounts: { findMany: vi.fn().mockResolvedValue([]) },
    cash_transactions: { create: vi.fn() },
  } as any;
  const service = new AccountingService(repo, prismaMock);
  return { service, repo, entries };
}


// ===========================================================================
// Property 12: Journal Entry Balance
//
// For all journal entries, sum(debit_paise) == sum(credit_paise);
// unbalanced entries rejected before persistence.
//
// **Validates: Requirements 12.7, 25.5**
// ===========================================================================

describe('Property 12: Journal Entry Balance', () => {
  it('for all balanced journal entries, createJournalEntry persists with sum(debits) == sum(credits)', async () => {
    await fc.assert(
      fc.asyncProperty(balancedDtoArb, async (dto) => {
        const { service, repo } = createServiceWithCapture();

        await service.createJournalEntry(dto);

        expect(repo.createJournalEntry).toHaveBeenCalledOnce();
        const passedData = (repo.createJournalEntry as ReturnType<typeof vi.fn>).mock.calls[0]![0];

        // Verify the persisted totals are balanced
        const totalDebit = BigInt(passedData.total_debit_paise);
        const totalCredit = BigInt(passedData.total_credit_paise);
        expect(totalDebit).toBe(totalCredit);
        expect(totalDebit).toBeGreaterThan(0n);

        // Verify line-level sums also balance
        const lineDebitSum = (passedData.lines as { debit_paise: bigint }[])
          .reduce((s, l) => s + BigInt(l.debit_paise), 0n);
        const lineCreditSum = (passedData.lines as { credit_paise: bigint }[])
          .reduce((s, l) => s + BigInt(l.credit_paise), 0n);
        expect(lineDebitSum).toBe(lineCreditSum);
      }),
      { numRuns: 1000 },
    );
  });

  it('for all unbalanced journal entries, createJournalEntry rejects before persistence', async () => {
    await fc.assert(
      fc.asyncProperty(unbalancedLinesArb, dateStrArb, sourceTypeArb, uuidArb, uuidArb, async (lines, date, sourceType, sourceId, createdBy) => {
        const { service, repo } = createServiceWithCapture();

        const dto = new CreateJournalEntryDto();
        dto.date = date!;
        dto.description = 'Unbalanced test';
        dto.sourceType = sourceType;
        dto.sourceId = sourceId;
        dto.createdBy = createdBy;
        dto.lines = lines;

        await expect(service.createJournalEntry(dto)).rejects.toThrow(BusinessRuleError);

        // Repository must NOT have been called — rejected before persistence
        expect(repo.createJournalEntry).not.toHaveBeenCalled();
      }),
      { numRuns: 500 },
    );
  });
});

// ===========================================================================
// Property 13: Journal Entry Immutability
//
// No posted journal entry can be modified or deleted; corrections only via
// new compensating entries. (Structural check: service/repository expose
// no update/delete methods)
//
// **Validates: Requirements 12.8**
// ===========================================================================

describe('Property 13: Journal Entry Immutability', () => {
  it('AccountingService exposes no update or delete methods for journal entries', () => {
    const { service } = createServiceWithCapture();
    const methods = getOwnMethodNames(service);

    for (const method of methods) {
      expect(isMutationMethod(method)).toBe(false);
    }
  });

  it('AccountingRepository exposes no update or delete methods for journal entries', () => {
    const repo = new (AccountingRepository as unknown as new (...args: unknown[]) => AccountingRepository)(
      {} as ConstructorParameters<typeof AccountingRepository>[0],
    );
    const methods = getOwnMethodNames(repo);

    for (const method of methods) {
      expect(isMutationMethod(method)).toBe(false);
    }
  });

  it('for all balanced entries, the only write path is createJournalEntry (append-only)', async () => {
    await fc.assert(
      fc.asyncProperty(balancedDtoArb, async (dto) => {
        const { service, repo } = createServiceWithCapture();

        await service.createJournalEntry(dto);

        // Only createJournalEntry should have been called — no other write method
        const repoMethods = Object.keys(repo).filter(
          (k) => typeof (repo as unknown as Record<string, unknown>)[k] === 'function',
        );
        for (const method of repoMethods) {
          if (method === 'createJournalEntry') {
            expect((repo as unknown as Record<string, ReturnType<typeof vi.fn>>)[method]).toHaveBeenCalledOnce();
          } else {
            expect((repo as unknown as Record<string, ReturnType<typeof vi.fn>>)[method]).not.toHaveBeenCalled();
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it('AccountingController exposes no PUT, PATCH, or DELETE endpoints for journal entries', async () => {
    const mod = await import('../accounting.controller');
    const controllerMethods = Object.getOwnPropertyNames(mod.AccountingController.prototype).filter(
      (name) => name !== 'constructor',
    );

    for (const method of controllerMethods) {
      expect(isMutationMethod(method)).toBe(false);
    }
  });
});


// ===========================================================================
// Property 14: Trial Balance Identity
//
// For all posted journal entries, sum of all debit balances == sum of all
// credit balances across all accounts.
//
// **Validates: Requirements 12.11**
// ===========================================================================

/**
 * Account definition for trial balance simulation.
 * Each account has a category that determines its normal balance side.
 */
interface SimAccount {
  id: string;
  code: string;
  name: string;
  category: string;
}

/** Generates a set of accounts covering all five categories */
function makeAccounts(): SimAccount[] {
  return [
    { id: 'asset-1', code: '1001', name: 'Cash', category: 'asset' },
    { id: 'asset-2', code: '1100', name: 'Loans Receivable', category: 'asset' },
    { id: 'liability-1', code: '2001', name: 'Accounts Payable', category: 'liability' },
    { id: 'income-1', code: '4001', name: 'Interest Income', category: 'income' },
    { id: 'income-2', code: '4002', name: 'Processing Fee Income', category: 'income' },
    { id: 'expense-1', code: '5001', name: 'Salary Expense', category: 'expense' },
    { id: 'equity-1', code: '3001', name: "Owner's Equity", category: 'equity' },
  ];
}

/**
 * Generates a sequence of balanced journal entry line sets using the fixed
 * account set. Each entry is a balanced debit/credit pair drawn from the
 * available accounts.
 */
const journalSequenceArb = (accounts: SimAccount[]) => {
  const accountIdArb = fc.constantFrom(...accounts.map((a) => a.id));
  const singleEntryArb = fc
    .tuple(accountIdArb, accountIdArb, amountArb)
    .filter(([debitAcct, creditAcct]) => debitAcct !== creditAcct)
    .map(([debitAcct, creditAcct, amount]) => [
      { account_id: debitAcct, debit_paise: BigInt(amount), credit_paise: 0n },
      { account_id: creditAcct, debit_paise: 0n, credit_paise: BigInt(amount) },
    ]);

  return fc.array(singleEntryArb, { minLength: 1, maxLength: 20 });
};

describe('Property 14: Trial Balance Identity', () => {
  it('for all sequences of balanced journal entries, trial balance debits == credits', async () => {
    const accounts = makeAccounts();

    await fc.assert(
      fc.asyncProperty(journalSequenceArb(accounts), async (entrySequence) => {
        // Aggregate all lines across all entries
        const allLines = entrySequence.flat();

        // Group by account: sum debits and credits
        const accountTotals = new Map<string, { debit: bigint; credit: bigint }>();
        for (const line of allLines) {
          const existing = accountTotals.get(line.account_id) ?? { debit: 0n, credit: 0n };
          existing.debit += line.debit_paise;
          existing.credit += line.credit_paise;
          accountTotals.set(line.account_id, existing);
        }

        // Build mock repo responses for getAccountBalances and findAllAccounts
        const balanceResults = [...accountTotals.entries()].map(([accountId, totals]) => ({
          account_id: accountId,
          _sum: { debit_paise: totals.debit, credit_paise: totals.credit },
        }));

        const { service, repo } = createServiceWithCapture();
        vi.mocked(repo.getAccountBalances).mockResolvedValue(balanceResults as never);
        vi.mocked(repo.findAllAccounts).mockResolvedValue(accounts as never);

        const result = await service.getTrialBalance();

        // The fundamental identity: total debit balances == total credit balances
        expect(result.isBalanced).toBe(true);
        expect(result.totalDebitBalancePaise).toBe(result.totalCreditBalancePaise);
      }),
      { numRuns: 1000 },
    );
  });
});

// ===========================================================================
// Property 15: Balance Sheet Equation
//
// For all points in time, total_assets == total_liabilities + total_equity.
// (Equity includes retained earnings = income - expenses)
//
// **Validates: Requirements 12.13**
// ===========================================================================

/**
 * Generates a sequence of balanced journal lines for balance sheet testing.
 * Each entry is a balanced debit/credit pair. The sequence is then fed to
 * getBalanceSheet via mocked getAccountTotalsUpTo (the DB-aggregated shape).
 */
const balanceSheetSequenceArb = (accounts: SimAccount[]) => {
  const accountArb = fc.constantFrom(...accounts);
  const singleEntryArb = fc
    .tuple(accountArb, accountArb, amountArb)
    .filter(([debitAcct, creditAcct]) => debitAcct.id !== creditAcct.id)
    .map(([debitAcct, creditAcct, amount]) => [
      {
        debit_paise: BigInt(amount),
        credit_paise: 0n,
        account: { id: debitAcct.id, code: debitAcct.code, name: debitAcct.name, category: debitAcct.category },
      },
      {
        debit_paise: 0n,
        credit_paise: BigInt(amount),
        account: { id: creditAcct.id, code: creditAcct.code, name: creditAcct.name, category: creditAcct.category },
      },
    ]);

  return fc.array(singleEntryArb, { minLength: 1, maxLength: 20 });
};

describe('Property 15: Balance Sheet Equation', () => {
  it('for all sequences of balanced journal entries, assets == liabilities + equity + retained_earnings', async () => {
    const accounts = makeAccounts();

    await fc.assert(
      fc.asyncProperty(balanceSheetSequenceArb(accounts), async (entrySequence) => {
        const allLines = entrySequence.flat();

        // Mirror the DB-side groupBy: collapse per-line data to per-account totals
        const totalsMap = new Map<string, { debit_paise: bigint; credit_paise: bigint }>();
        for (const line of allLines) {
          const existing = totalsMap.get(line.account.id) ?? { debit_paise: 0n, credit_paise: 0n };
          existing.debit_paise += line.debit_paise;
          existing.credit_paise += line.credit_paise;
          totalsMap.set(line.account.id, existing);
        }
        const totals = [...totalsMap.entries()].map(([account_id, _sum]) => ({ account_id, _sum }));

        const { service, repo } = createServiceWithCapture();
        vi.mocked(repo.findAllAccounts).mockResolvedValue(
          accounts.map((a) => ({
            ...a,
            parent_id: null,
            is_system: true,
            is_active: true,
            created_at: new Date(),
          })) as never,
        );
        vi.mocked(repo.getAccountTotalsUpTo).mockResolvedValue(totals as never);

        const result = await service.getBalanceSheet();

        // The fundamental equation: assets == liabilities + equity + retained earnings
        expect(result.isBalanced).toBe(true);

        const totalAssets = BigInt(result.totalAssetsPaise);
        const totalLiabilities = BigInt(result.totalLiabilitiesPaise);
        const totalEquity = BigInt(result.totalEquityPaise);
        const retainedEarnings = BigInt(result.retainedEarningsPaise);

        expect(totalAssets).toBe(totalLiabilities + totalEquity + retainedEarnings);
      }),
      { numRuns: 1000 },
    );
  });
});


// ===========================================================================
// Property 24: Balanced Entries
//
// For any valid journal entry (generated via the shared journalEntryArb),
// total debit paise == total credit paise.
//
// **Validates: Requirements 22.1**
// ===========================================================================

describe('Property 24: Balanced Entries', () => {
  it('total debit paise = total credit paise for any valid journal entry', () => {
    fc.assert(
      fc.property(journalEntryArb, (entry) => {
        // Verify entry-level totals are balanced
        expect(entry.totalDebitPaise).toBe(entry.totalCreditPaise);
        expect(entry.totalDebitPaise).toBeGreaterThan(0);

        // Verify line-level sums match entry totals
        const lineDebitSum = entry.lines.reduce((s, l) => s + l.debitPaise, 0);
        const lineCreditSum = entry.lines.reduce((s, l) => s + l.creditPaise, 0);
        expect(lineDebitSum).toBe(lineCreditSum);
        expect(lineDebitSum).toBe(entry.totalDebitPaise);
      }),
      { numRuns: 1000 },
    );
  });

  it('balanced entries pass service validation via createJournalEntry', async () => {
    await fc.assert(
      fc.asyncProperty(journalEntryArb, async (entry) => {
        const { service, repo } = createServiceWithCapture();

        const dto = new CreateJournalEntryDto();
        dto.date = entry.entryDate.toISOString().split('T')[0]!;
        dto.description = entry.description;
        dto.sourceType = entry.sourceType;
        dto.sourceId = entry.sourceId;
        dto.createdBy = entry.createdBy;
        dto.lines = entry.lines.map((l) => ({
          accountId: l.accountId,
          debitPaise: l.debitPaise,
          creditPaise: l.creditPaise,
        }));

        await service.createJournalEntry(dto);

        expect(repo.createJournalEntry).toHaveBeenCalledOnce();
        const passedData = (repo.createJournalEntry as ReturnType<typeof vi.fn>).mock.calls[0]![0];
        expect(BigInt(passedData.total_debit_paise)).toBe(BigInt(passedData.total_credit_paise));
      }),
      { numRuns: 1000 },
    );
  });
});

// ===========================================================================
// Property 25: Trial Balance
//
// For any sequence of valid balanced journal entries posted across accounts,
// trial balance total debits == total credits.
//
// **Validates: Requirements 22.2**
// ===========================================================================

describe('Property 25: Trial Balance', () => {
  it('trial balance total debits = total credits across all accounts', async () => {
    const accounts = makeAccounts();

    // Generate sequences of balanced journal entries using the shared arbitrary
    const entrySequenceArb = fc.array(journalEntryArb, { minLength: 1, maxLength: 10 });

    await fc.assert(
      fc.asyncProperty(entrySequenceArb, async (entries) => {
        // Aggregate all lines across all entries, mapping account IDs to our
        // fixed account set so the trial balance can resolve categories
        const accountTotals = new Map<string, { debit: bigint; credit: bigint }>();

        for (const entry of entries) {
          for (let i = 0; i < entry.lines.length; i++) {
            const line = entry.lines[i]!;
            // Map each line to one of our fixed accounts (round-robin)
            const account = accounts[i % accounts.length]!;
            const existing = accountTotals.get(account.id) ?? { debit: 0n, credit: 0n };
            existing.debit += BigInt(line.debitPaise);
            existing.credit += BigInt(line.creditPaise);
            accountTotals.set(account.id, existing);
          }
        }

        const balanceResults = [...accountTotals.entries()].map(([accountId, totals]) => ({
          account_id: accountId,
          _sum: { debit_paise: totals.debit, credit_paise: totals.credit },
        }));

        const { service, repo } = createServiceWithCapture();
        vi.mocked(repo.getAccountBalances).mockResolvedValue(balanceResults as never);
        vi.mocked(repo.findAllAccounts).mockResolvedValue(accounts as never);

        const result = await service.getTrialBalance();

        expect(result.isBalanced).toBe(true);
        expect(result.totalDebitBalancePaise).toBe(result.totalCreditBalancePaise);
      }),
      { numRuns: 1000 },
    );
  });
});

// ===========================================================================
// Property 26: Positive Amounts
//
// All journal entry amounts (debit and credit on every line) are positive
// integers (> 0 for the active side, exactly 0 for the inactive side).
//
// **Validates: Requirements 22.3, 22.4**
// ===========================================================================

describe('Property 26: Positive Amounts', () => {
  it('all journal entry amounts are positive integers', () => {
    fc.assert(
      fc.property(journalEntryArb, (entry) => {
        for (const line of entry.lines) {
          // Both amounts must be non-negative integers
          expect(Number.isInteger(line.debitPaise)).toBe(true);
          expect(Number.isInteger(line.creditPaise)).toBe(true);
          expect(line.debitPaise).toBeGreaterThanOrEqual(0);
          expect(line.creditPaise).toBeGreaterThanOrEqual(0);

          // Each line must have exactly one positive side (debit XOR credit)
          const hasDebit = line.debitPaise > 0;
          const hasCredit = line.creditPaise > 0;
          expect(hasDebit || hasCredit).toBe(true);
          expect(hasDebit && hasCredit).toBe(false);
        }

        // Entry-level totals must be positive integers
        expect(Number.isInteger(entry.totalDebitPaise)).toBe(true);
        expect(Number.isInteger(entry.totalCreditPaise)).toBe(true);
        expect(entry.totalDebitPaise).toBeGreaterThan(0);
        expect(entry.totalCreditPaise).toBeGreaterThan(0);
      }),
      { numRuns: 1000 },
    );
  });

  it('service rejects entries with non-positive line amounts', async () => {
    // Generate lines where one line has zero amounts (invalid)
    const zeroLineArb = fc.tuple(uuidArb, uuidArb).map(([accA, accB]): JournalLineDto[] => [
      { accountId: accA, debitPaise: 0, creditPaise: 0 },
      { accountId: accB, debitPaise: 100, creditPaise: 0 },
    ]);

    await fc.assert(
      fc.asyncProperty(zeroLineArb, dateStrArb, sourceTypeArb, uuidArb, uuidArb, async (lines, date, sourceType, sourceId, createdBy) => {
        const { service, repo } = createServiceWithCapture();

        const dto = new CreateJournalEntryDto();
        dto.date = date!;
        dto.description = 'Zero amount test';
        dto.sourceType = sourceType;
        dto.sourceId = sourceId;
        dto.createdBy = createdBy;
        dto.lines = lines;

        await expect(service.createJournalEntry(dto)).rejects.toThrow(BusinessRuleError);
        expect(repo.createJournalEntry).not.toHaveBeenCalled();
      }),
      { numRuns: 100 },
    );
  });
});
