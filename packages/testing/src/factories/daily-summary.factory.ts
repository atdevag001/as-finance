import { buildEntity } from './helpers.js';

/**
 * DailySummaryInput — input for the pure cashbook daily summary computation.
 * Not a Prisma model; used by computeDailySummary().
 */
export interface DailySummaryInput {
  openingBalancePaise: bigint;
  transactions: { type: 'inflow' | 'outflow'; amountPaise: bigint; category: string }[];
}

export function buildDailySummaryInput(
  overrides?: Partial<DailySummaryInput>,
): DailySummaryInput {
  return buildEntity<DailySummaryInput>(
    {
      openingBalancePaise: 100_000n,
      transactions: [
        { type: 'inflow', amountPaise: 50_000n, category: 'collection' },
        { type: 'outflow', amountPaise: 10_000n, category: 'expense' },
      ],
    },
    overrides,
  );
}
