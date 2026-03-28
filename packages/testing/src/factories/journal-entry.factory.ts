import { JournalSourceType, AccountCategory } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

export interface TestJournalLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  accountCode: string;
  accountCategory: AccountCategory;
  debitPaise: number;
  creditPaise: number;
}

export interface TestJournalEntry {
  id: string;
  date: Date;
  description: string;
  sourceType: JournalSourceType;
  sourceId: string;
  lines: TestJournalLine[];
  createdAt: Date;
}

/**
 * Creates a valid balanced journal entry.
 * Default: a disbursement entry debiting Loans Receivable and crediting Cash.
 */
export function createJournalEntry(
  overrides?: Partial<TestJournalEntry>,
): TestJournalEntry {
  const now = new Date();
  const entryId = overrides?.id ?? randomUUID();
  const amountPaise = 10000000; // ₹1,00,000

  const defaultLines: TestJournalLine[] = [
    {
      id: randomUUID(),
      journalEntryId: entryId,
      accountId: randomUUID(),
      accountCode: '1100',
      accountCategory: AccountCategory.ASSET,
      debitPaise: amountPaise,
      creditPaise: 0,
    },
    {
      id: randomUUID(),
      journalEntryId: entryId,
      accountId: randomUUID(),
      accountCode: '1001',
      accountCategory: AccountCategory.ASSET,
      debitPaise: 0,
      creditPaise: amountPaise,
    },
  ];

  return buildEntity<TestJournalEntry>(
    {
      id: entryId,
      date: now,
      description: 'Loan disbursement',
      sourceType: JournalSourceType.DISBURSEMENT,
      sourceId: randomUUID(),
      lines: defaultLines,
      createdAt: now,
    },
    overrides,
  );
}
