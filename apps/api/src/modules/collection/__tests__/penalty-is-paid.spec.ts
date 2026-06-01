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
 * Post-fix: applyPenaltyPayment uses a single atomic SQL UPDATE that
 * increments paid_paise AND conditionally flips is_paid in one statement
 * (no two-step race). reversePenaltyPayment undoes both on collection reversal.
 */

describe('CollectionRepository.applyPenaltyPayment (single atomic UPDATE)', () => {
  it('issues one atomic UPDATE that increments + conditionally flips is_paid', async () => {
    const executeRawSpy = vi.fn().mockResolvedValue(1);
    const tx = { $executeRaw: executeRawSpy } as unknown as TxClient;
    const repo = new CollectionRepository({} as never);

    await repo.applyPenaltyPayment('pen-1', 100n, tx);

    // Exactly one raw UPDATE call (atomic; no two-step window)
    expect(executeRawSpy).toHaveBeenCalledOnce();
    // The query string includes UPDATE penalties + the conditional is_paid set
    const sqlParts = executeRawSpy.mock.calls[0]![0] as TemplateStringsArray;
    const sql = Array.from(sqlParts).join('');
    expect(sql).toMatch(/UPDATE penalties/);
    expect(sql).toMatch(/is_paid/);
    expect(sql).toMatch(/paid_paise \+/);
    expect(sql).toMatch(/amount_paise/);
  });

  it('passes the alloc amount and penaltyId as parameters (no string concat injection)', async () => {
    const executeRawSpy = vi.fn().mockResolvedValue(1);
    const tx = { $executeRaw: executeRawSpy } as unknown as TxClient;
    const repo = new CollectionRepository({} as never);

    await repo.applyPenaltyPayment('pen-42', 75n, tx);

    // tagged-template arguments after the template strings array carry the values
    const args = executeRawSpy.mock.calls[0]!;
    expect(args).toContain(75n);
    expect(args).toContain('pen-42');
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
