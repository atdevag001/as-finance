import { describe, it, expect } from 'vitest';
import { expectBalanced, expectNonNegativePaise, expectMonotonicallyIncreasing } from '../index.js';
import { buildJournalEntry, buildJournalLine } from '../../factories/build-aliases.factory.js';

describe('expectBalanced', () => {
  it('passes for a balanced journal entry', () => {
    const entry = buildJournalEntry();
    expect(() => expectBalanced(entry)).not.toThrow();
  });

  it('fails when header totals are unbalanced', () => {
    const entry = buildJournalEntry({ totalDebitPaise: 100, totalCreditPaise: 200 });
    expect(() => expectBalanced(entry)).toThrow();
  });

  it('fails when line sums are unbalanced', () => {
    const entry = buildJournalEntry({
      totalDebitPaise: 500,
      totalCreditPaise: 500,
      lines: [
        buildJournalLine({ debitPaise: 500, creditPaise: 0 }),
        buildJournalLine({ debitPaise: 0, creditPaise: 300 }),
      ],
    });
    expect(() => expectBalanced(entry)).toThrow();
  });

  it('fails when header disagrees with line sums', () => {
    const entry = buildJournalEntry({
      totalDebitPaise: 999,
      totalCreditPaise: 999,
      lines: [
        buildJournalLine({ debitPaise: 500, creditPaise: 0 }),
        buildJournalLine({ debitPaise: 0, creditPaise: 500 }),
      ],
    });
    expect(() => expectBalanced(entry)).toThrow();
  });
});

describe('expectNonNegativePaise', () => {
  it('passes for zero', () => {
    expect(() => expectNonNegativePaise(0)).not.toThrow();
  });

  it('passes for positive integers', () => {
    expect(() => expectNonNegativePaise(100_000)).not.toThrow();
  });

  it('fails for negative values', () => {
    expect(() => expectNonNegativePaise(-1)).toThrow();
  });

  it('fails for fractional values', () => {
    expect(() => expectNonNegativePaise(10.5)).toThrow();
  });
});

describe('expectMonotonicallyIncreasing', () => {
  it('passes for strictly increasing dates', () => {
    const dates = [
      new Date('2024-01-01'),
      new Date('2024-02-01'),
      new Date('2024-03-01'),
    ];
    expect(() => expectMonotonicallyIncreasing(dates)).not.toThrow();
  });

  it('passes for empty array', () => {
    expect(() => expectMonotonicallyIncreasing([])).not.toThrow();
  });

  it('passes for single date', () => {
    expect(() => expectMonotonicallyIncreasing([new Date()])).not.toThrow();
  });

  it('fails for equal dates', () => {
    const d = new Date('2024-01-01');
    expect(() => expectMonotonicallyIncreasing([d, d])).toThrow();
  });

  it('fails for decreasing dates', () => {
    const dates = [
      new Date('2024-03-01'),
      new Date('2024-02-01'),
      new Date('2024-01-01'),
    ];
    expect(() => expectMonotonicallyIncreasing(dates)).toThrow();
  });
});
