/**
 * Journal/accounting fast-check arbitraries.
 * Generates balanced journal entries (total debits = total credits).
 */
import fc from 'fast-check';
import { AccountCategory, JournalSourceType } from '@as-finance/shared';
import type { JournalEntry, JournalLine } from '../factories/build-aliases.factory.js';

const accountCategoryArb = fc.constantFrom(
  AccountCategory.ASSET,
  AccountCategory.LIABILITY,
  AccountCategory.INCOME,
  AccountCategory.EXPENSE,
  AccountCategory.EQUITY,
);

const accountCodeArb = fc.stringMatching(/^[1-9]\d{3}$/);

/** Single journal line — either debit or credit, never both */
export const journalLineArb: fc.Arbitrary<JournalLine> = fc.record({
  id: fc.uuid(),
  journalEntryId: fc.uuid(),
  accountId: fc.uuid(),
  accountCode: accountCodeArb,
  accountCategory: accountCategoryArb,
  debitPaise: fc.integer({ min: 0, max: 10_000_000 }),
  creditPaise: fc.constant(0),
});

/**
 * Balanced journal entry: generates N debit lines and N credit lines
 * where total debits = total credits.
 */
export const journalEntryArb: fc.Arbitrary<JournalEntry> = fc
  .integer({ min: 1, max: 5 })
  .chain((lineCount) =>
    fc.tuple(
      fc.uuid(),
      fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
      fc.string({ minLength: 1, maxLength: 100 }),
      fc.constantFrom(...Object.values(JournalSourceType)),
      fc.uuid(),
      fc.uuid(),
      fc.array(fc.integer({ min: 1, max: 1_000_000 }), {
        minLength: lineCount,
        maxLength: lineCount,
      }),
      fc.array(accountCodeArb, { minLength: lineCount * 2, maxLength: lineCount * 2 }),
      fc.array(accountCategoryArb, { minLength: lineCount * 2, maxLength: lineCount * 2 }),
      fc.array(fc.uuid(), { minLength: lineCount * 2, maxLength: lineCount * 2 }),
    ).map(([entryId, entryDate, description, sourceType, sourceId, createdBy, amounts, codes, categories, lineIds]) => {
      const totalPaise = amounts.reduce((s, a) => s + a, 0);
      const debitLines: JournalLine[] = amounts.map((amt, i) => ({
        id: lineIds[i]!,
        journalEntryId: entryId,
        accountId: lineIds[i]!,
        accountCode: codes[i]!,
        accountCategory: categories[i]!,
        debitPaise: amt,
        creditPaise: 0,
      }));
      const creditLines: JournalLine[] = amounts.map((amt, i) => ({
        id: lineIds[lineCount + i]!,
        journalEntryId: entryId,
        accountId: lineIds[lineCount + i]!,
        accountCode: codes[lineCount + i]!,
        accountCategory: categories[lineCount + i]!,
        debitPaise: 0,
        creditPaise: amt,
      }));
      return {
        id: entryId,
        entryDate,
        description,
        sourceType,
        sourceId,
        totalDebitPaise: totalPaise,
        totalCreditPaise: totalPaise,
        createdBy,
        lines: [...debitLines, ...creditLines],
        createdAt: new Date(),
      };
    }),
  );
