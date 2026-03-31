/**
 * build* aliases for existing create* factories.
 *
 * The design doc specifies `build*` naming for factory functions used in
 * unit and property-based tests. These re-export the existing `create*`
 * factories under the `build*` naming convention.
 */

export { createUser as buildUser, type TestUser } from './user.factory.js';
export { createCustomer as buildCustomer, type TestCustomer } from './customer.factory.js';
export { createLoan as buildLoan, type TestLoan } from './loan.factory.js';
export { createLoanProduct as buildLoanProduct, type TestLoanProduct, type TestLoanProductVersion } from './loan-product.factory.js';

// Journal entry and line build* wrappers
import { AccountCategory, JournalSourceType } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

/**
 * JournalLine — a single debit or credit line in a journal entry.
 * Maps to `journal_lines` Prisma model fields.
 */
export interface JournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode: string;
  accountCategory: AccountCategory;
  debitPaise: number;
  creditPaise: number;
}

/**
 * JournalEntry — a double-entry accounting record.
 * Maps to `journal_entries` Prisma model fields.
 */
export interface JournalEntry {
  id: string;
  entryDate: Date;
  description: string;
  sourceType: JournalSourceType;
  sourceId: string;
  totalDebitPaise: number;
  totalCreditPaise: number;
  createdBy: string;
  lines: JournalLine[];
  createdAt: Date;
}

export function buildJournalLine(
  overrides?: Partial<JournalLine>,
): JournalLine {
  return buildEntity<JournalLine>(
    {
      id: randomUUID(),
      journalEntryId: randomUUID(),
      accountId: randomUUID(),
      accountCode: '1100',
      accountCategory: AccountCategory.ASSET,
      debitPaise: 100_000_00,
      creditPaise: 0,
    },
    overrides,
  );
}

export function buildJournalEntry(
  overrides?: Partial<JournalEntry>,
): JournalEntry {
  const entryId = overrides?.id ?? randomUUID();
  const amountPaise = 100_000_00;

  const defaultLines: JournalLine[] = [
    buildJournalLine({
      journalEntryId: entryId,
      accountCode: '1100',
      accountCategory: AccountCategory.ASSET,
      debitPaise: amountPaise,
      creditPaise: 0,
    }),
    buildJournalLine({
      journalEntryId: entryId,
      accountCode: '1001',
      accountCategory: AccountCategory.ASSET,
      debitPaise: 0,
      creditPaise: amountPaise,
    }),
  ];

  return buildEntity<JournalEntry>(
    {
      id: entryId,
      entryDate: new Date('2024-01-15'),
      description: 'Loan disbursement',
      sourceType: JournalSourceType.DISBURSEMENT,
      sourceId: randomUUID(),
      totalDebitPaise: amountPaise,
      totalCreditPaise: amountPaise,
      createdBy: randomUUID(),
      lines: defaultLines,
      createdAt: new Date(),
    },
    overrides,
  );
}
