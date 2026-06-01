import { describe, it, expect, vi } from 'vitest';
import { CollectionRepository } from '../collection.repository';

type TxClient = Parameters<typeof CollectionRepository.prototype.applyPenaltyPayment>[2];

/**
 * Critical-path regression test for the penalty.is_paid persistence bug.
 *
 * Pre-fix: collection.service allocated to penalties but never updated
 * penalties.is_paid; the same penalty kept appearing in getPendingPenalties
 * on every subsequent collection, leading to double/triple-charging and
 * preventing loan closure.
 *
 * Post-fix: applyPenaltyPayment increments paid_paise and flips is_paid
 * when paid_paise >= amount_paise. reversePenaltyPayment undoes both on
 * collection reversal.
 */

function makeMockTx(updates: Array<Record<string, unknown>> = []) {
  return {
    penalties: {
      update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
        updates.push({ id: args.where.id, ...args.data });
        // After increment, simulate updated paid_paise — full amount per call here
        return Promise.resolve({
          paid_paise: 100n,
          amount_paise: 100n,
        });
      }),
    },
  } as unknown as TxClient;
}

describe('CollectionRepository.applyPenaltyPayment', () => {
  it('increments paid_paise and flips is_paid when fully paid', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const tx = makeMockTx(updates);
    const repo = new CollectionRepository({} as never);

    await repo.applyPenaltyPayment('pen-1', 100n, tx);

    // First call: increment paid_paise
    expect(updates[0]).toMatchObject({
      id: 'pen-1',
      paid_paise: { increment: 100n },
    });
    // Second call: set is_paid (because paid_paise >= amount_paise)
    expect(updates[1]).toMatchObject({
      id: 'pen-1',
      is_paid: true,
    });
  });

  it('does NOT flip is_paid on partial payment', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const tx = {
      penalties: {
        update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: args.where.id, ...args.data });
          // paid_paise (50) < amount_paise (100) → still unpaid
          return Promise.resolve({ paid_paise: 50n, amount_paise: 100n });
        }),
      },
    } as unknown as TxClient;
    const repo = new CollectionRepository({} as never);

    await repo.applyPenaltyPayment('pen-1', 50n, tx);

    // Only one update call: increment. No is_paid=true call.
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ paid_paise: { increment: 50n } });
    expect(updates.find((u) => u['is_paid'] === true)).toBeUndefined();
  });
});

describe('CollectionRepository.reversePenaltyPayment', () => {
  it('decrements paid_paise and clears is_paid', async () => {
    const updates: Array<Record<string, unknown>> = [];
    const tx = {
      penalties: {
        update: vi.fn((args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ id: args.where.id, ...args.data });
          return Promise.resolve({});
        }),
      },
    } as unknown as TxClient;
    const repo = new CollectionRepository({} as never);

    await repo.reversePenaltyPayment('pen-1', 100n, tx);

    expect(updates[0]).toMatchObject({
      id: 'pen-1',
      paid_paise: { decrement: 100n },
      is_paid: false,
    });
  });
});
