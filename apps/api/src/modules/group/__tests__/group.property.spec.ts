import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { GroupService } from '../group.service';
import { BusinessRuleError } from '../../../common/errors';

/**
 * Property 30: Group Size Constraint
 *
 * For all group member addition or creation operations, the resulting active
 * member count SHALL be between 5 and 15 inclusive. Operations that would
 * violate this constraint SHALL be rejected.
 *
 * **Validates: Requirements 11.2**
 */

/**
 * Property 31: Group Collection Sum Integrity
 *
 * For all group collections with a member-wise breakdown,
 * sum(member_breakdown[i].amount_paise) == total_amount_paise.
 * Any discrepancy SHALL cause rejection of the entire group collection.
 *
 * **Validates: Requirements 11.5**
 */

/**
 * Property 41: Batch Collection Per-Member Dispatch
 *
 * For any valid group collection with N members in the breakdown,
 * postCollection() SHALL be called exactly N times — once per member —
 * with the correct loanId and amountPaise from the breakdown.
 * The sum of all dispatched amounts equals the total group collection amount.
 *
 * **Validates: Requirements 28.4**
 */

/**
 * Property 42: Batch Collection Atomicity
 *
 * If any individual member's collection fails during a group collection,
 * the entire batch SHALL fail (transaction rollback). No partial group
 * collection record or individual collection results SHALL persist.
 *
 * **Validates: Requirements 29.1**
 */

// ── Constants ────────────────────────────────────────────────────────────────

const MIN_GROUP_SIZE = 5;
const MAX_GROUP_SIZE = 15;

// ── Generators ───────────────────────────────────────────────────────────────

const uuidArb = fc.uuid();

/** Generates a valid active member count within the allowed range [5, 15] */
const validMemberCountArb = fc.integer({ min: MIN_GROUP_SIZE, max: MAX_GROUP_SIZE });

/** Generates a member count that is at or above max (addition should be rejected) */
const atMaxMemberCountArb = fc.integer({ min: MAX_GROUP_SIZE, max: 50 });

/** Generates a member count that is at or below min (removal should be rejected) */
const atMinMemberCountArb = fc.integer({ min: 1, max: MIN_GROUP_SIZE });

/** Generates a member count below max where addition is allowed */
const belowMaxMemberCountArb = fc.integer({ min: 1, max: MAX_GROUP_SIZE - 1 });

/** Generates a member count above min where removal is allowed */
const aboveMinMemberCountArb = fc.integer({ min: MIN_GROUP_SIZE + 1, max: 30 });

/** Generates a positive integer amount in paise */
const amountPaiseArb = fc.integer({ min: 1, max: 10_000_000 });

/** Generates a non-empty array of member breakdown items with positive amounts */
const memberBreakdownArb = fc
  .array(
    fc.record({
      loanId: uuidArb,
      amountPaise: amountPaiseArb,
    }),
    { minLength: 1, maxLength: 15 },
  );

// ── Mock Factory ─────────────────────────────────────────────────────────────

function createMocks() {
  const mockGroupRepository = {
    createGroup: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    countActiveMembers: vi.fn(),
    isActiveMember: vi.fn(),
    addMember: vi.fn(),
    findMemberById: vi.fn(),
    deactivateMember: vi.fn(),
    hasActiveGroupLoans: vi.fn(),
    customerExists: vi.fn(),
    createGroupCollection: vi.fn(),
    getGroupMemberLoans: vi.fn(),
    getGroupLoanSummaries: vi.fn(),
    getGroupSummaryData: vi.fn(),
    // Always succeed in property tests; we exercise the business-rule branches, not the lock itself.
    lockGroupForUpdate: vi.fn().mockResolvedValue({ id: 'g1' }),
  };

  const mockCollectionService = {
    postCollection: vi.fn(),
    executeCollection: vi.fn(),
  };

  const mockAuditService = {
    createAuditLog: vi.fn().mockResolvedValue({}),
  };

  const mockIdempotencyService = {
    find: vi.fn(),
    store: vi.fn(),
  };

  const mockPrisma = {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };

  const service = new GroupService(
    mockPrisma as never,
    mockGroupRepository as never,
    mockCollectionService as never,
    mockAuditService as never,
    mockIdempotencyService as never,
  );

  return {
    service,
    mockGroupRepository,
    mockCollectionService,
    mockAuditService,
    mockIdempotencyService,
    mockPrisma,
  };
}

// ── Property 30: Group Size Constraint ───────────────────────────────────────

describe('Property 30: Group Size Constraint', () => {
  it('addMember rejects when active member count is at or above MAX_GROUP_SIZE (15)', async () => {
    await fc.assert(
      fc.asyncProperty(atMaxMemberCountArb, uuidArb, uuidArb, async (currentCount, groupId, customerId) => {
        const { service, mockGroupRepository } = createMocks();

        mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
        mockGroupRepository.customerExists.mockResolvedValue(true);
        mockGroupRepository.isActiveMember.mockResolvedValue(false);
        mockGroupRepository.countActiveMembers.mockResolvedValue(currentCount);

        await expect(
          service.addMember(groupId, { customerId }, 'actor1', 'field_officer'),
        ).rejects.toThrow(BusinessRuleError);

        // Verify addMember on the repository was never called
        expect(mockGroupRepository.addMember).not.toHaveBeenCalled();
      }),
      { numRuns: 200 },
    );
  });

  it('addMember succeeds when active member count is below MAX_GROUP_SIZE', async () => {
    await fc.assert(
      fc.asyncProperty(belowMaxMemberCountArb, uuidArb, uuidArb, async (currentCount, groupId, customerId) => {
        const { service, mockGroupRepository } = createMocks();

        mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
        mockGroupRepository.customerExists.mockResolvedValue(true);
        mockGroupRepository.isActiveMember.mockResolvedValue(false);
        mockGroupRepository.countActiveMembers.mockResolvedValue(currentCount);
        mockGroupRepository.addMember.mockResolvedValue({ id: 'new-member-id' });

        const result = await service.addMember(groupId, { customerId }, 'actor1', 'field_officer');
        expect(result).toBeDefined();
        expect(mockGroupRepository.addMember).toHaveBeenCalledOnce();
      }),
      { numRuns: 200 },
    );
  });

  it('removeMember rejects when active member count is at or below MIN_GROUP_SIZE (5)', async () => {
    await fc.assert(
      fc.asyncProperty(atMinMemberCountArb, uuidArb, uuidArb, uuidArb, async (currentCount, groupId, memberId, customerId) => {
        const { service, mockGroupRepository } = createMocks();

        mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
        mockGroupRepository.findMemberById.mockResolvedValue({
          id: memberId,
          group_id: groupId,
          customer_id: customerId,
          is_active: true,
        });
        mockGroupRepository.countActiveMembers.mockResolvedValue(currentCount);

        await expect(
          service.removeMember(groupId, memberId, 'actor1', 'manager'),
        ).rejects.toThrow(BusinessRuleError);

        // Verify deactivateMember was never called
        expect(mockGroupRepository.deactivateMember).not.toHaveBeenCalled();
      }),
      { numRuns: 200 },
    );
  });

  it('removeMember succeeds when active member count is above MIN_GROUP_SIZE', async () => {
    await fc.assert(
      fc.asyncProperty(aboveMinMemberCountArb, uuidArb, uuidArb, uuidArb, async (currentCount, groupId, memberId, customerId) => {
        const { service, mockGroupRepository } = createMocks();

        mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
        mockGroupRepository.findMemberById.mockResolvedValue({
          id: memberId,
          group_id: groupId,
          customer_id: customerId,
          is_active: true,
        });
        mockGroupRepository.countActiveMembers.mockResolvedValue(currentCount);
        mockGroupRepository.hasActiveGroupLoans.mockResolvedValue(false);
        mockGroupRepository.deactivateMember.mockResolvedValue({});

        const result = await service.removeMember(groupId, memberId, 'actor1', 'manager');
        expect(result).toEqual({ success: true });
        expect(mockGroupRepository.deactivateMember).toHaveBeenCalledOnce();
      }),
      { numRuns: 200 },
    );
  });

  it('for all valid member counts after add/remove, count stays within [5, 15]', async () => {
    await fc.assert(
      fc.asyncProperty(
        validMemberCountArb,
        fc.boolean(),
        uuidArb,
        uuidArb,
        uuidArb,
        async (startCount, isAdd, groupId, memberId, customerId) => {
          const { service, mockGroupRepository } = createMocks();

          if (isAdd) {
            // Attempt to add a member
            mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
            mockGroupRepository.customerExists.mockResolvedValue(true);
            mockGroupRepository.isActiveMember.mockResolvedValue(false);
            mockGroupRepository.countActiveMembers.mockResolvedValue(startCount);
            mockGroupRepository.addMember.mockResolvedValue({ id: 'new-member' });

            if (startCount >= MAX_GROUP_SIZE) {
              // Should reject — count would exceed 15
              await expect(
                service.addMember(groupId, { customerId }, 'actor1', 'field_officer'),
              ).rejects.toThrow(BusinessRuleError);
            } else {
              // Should succeed — resulting count is startCount + 1 ≤ 15
              const result = await service.addMember(groupId, { customerId }, 'actor1', 'field_officer');
              expect(result).toBeDefined();
              const resultingCount = startCount + 1;
              expect(resultingCount).toBeGreaterThanOrEqual(MIN_GROUP_SIZE);
              expect(resultingCount).toBeLessThanOrEqual(MAX_GROUP_SIZE);
            }
          } else {
            // Attempt to remove a member
            mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
            mockGroupRepository.findMemberById.mockResolvedValue({
              id: memberId,
              group_id: groupId,
              customer_id: customerId,
              is_active: true,
            });
            mockGroupRepository.countActiveMembers.mockResolvedValue(startCount);
            mockGroupRepository.hasActiveGroupLoans.mockResolvedValue(false);
            mockGroupRepository.deactivateMember.mockResolvedValue({});

            if (startCount <= MIN_GROUP_SIZE) {
              // Should reject — count would drop below 5
              await expect(
                service.removeMember(groupId, memberId, 'actor1', 'manager'),
              ).rejects.toThrow(BusinessRuleError);
            } else {
              // Should succeed — resulting count is startCount - 1 ≥ 5
              const result = await service.removeMember(groupId, memberId, 'actor1', 'manager');
              expect(result).toEqual({ success: true });
              const resultingCount = startCount - 1;
              expect(resultingCount).toBeGreaterThanOrEqual(MIN_GROUP_SIZE);
              expect(resultingCount).toBeLessThanOrEqual(MAX_GROUP_SIZE);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});

// ── Property 31: Group Collection Sum Integrity ──────────────────────────────

describe('Property 31: Group Collection Sum Integrity', () => {
  it('rejects when sum(member_breakdown amounts) != total_amount_paise', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberBreakdownArb,
        fc.integer({ min: 1, max: 1_000_000 }),
        uuidArb,
        async (breakdown, discrepancy, groupId) => {
          const { service, mockGroupRepository, mockIdempotencyService } = createMocks();

          const correctSum = breakdown.reduce((sum, m) => sum + m.amountPaise, 0);
          // Ensure total differs from the sum by adding a non-zero discrepancy
          const wrongTotal = correctSum + (discrepancy === 0 ? 1 : discrepancy);

          mockIdempotencyService.find.mockResolvedValue(null);
          mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });

          await expect(
            service.postGroupCollection(
              groupId,
              {
                totalAmountPaise: wrongTotal,
                collectionDate: '2024-06-15',
                paymentMode: 'cash' as never,
                idempotencyKey: `key-${crypto.randomUUID()}`,
                memberBreakdown: breakdown,
              },
              'actor1',
              'collection_officer',
            ),
          ).rejects.toThrow(BusinessRuleError);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('accepts when sum(member_breakdown amounts) == total_amount_paise', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberBreakdownArb,
        uuidArb,
        async (breakdown, groupId) => {
          const { service, mockGroupRepository, mockIdempotencyService, mockCollectionService } = createMocks();

          const correctSum = breakdown.reduce((sum, m) => sum + m.amountPaise, 0);

          // Set up all mocks for a successful path
          mockIdempotencyService.find.mockResolvedValue(null);
          mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });

          // All loans in breakdown must be recognized as group loans
          const groupLoans = breakdown.map((m) => ({ id: m.loanId, loan_number: `LN-${m.loanId}` }));
          mockGroupRepository.getGroupLoanSummaries.mockResolvedValue(groupLoans);
          mockGroupRepository.createGroupCollection.mockResolvedValue({ id: 'gc-1' });
          mockCollectionService.executeCollection.mockResolvedValue({ collectionId: 'c-1' });
          mockIdempotencyService.store.mockResolvedValue({});

          // Should NOT throw — sum matches total
          const result = await service.postGroupCollection(
            groupId,
            {
              totalAmountPaise: correctSum,
              collectionDate: '2024-06-15',
              paymentMode: 'cash' as never,
              idempotencyKey: `key-${crypto.randomUUID()}`,
              memberBreakdown: breakdown,
            },
            'actor1',
            'collection_officer',
          );

          expect(result.statusCode).toBe(201);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('the sum validation is exact — even 1 paisa discrepancy causes rejection', async () => {
    await fc.assert(
      fc.asyncProperty(
        memberBreakdownArb,
        fc.constantFrom(-1, 1),
        uuidArb,
        async (breakdown, offset, groupId) => {
          const { service, mockGroupRepository, mockIdempotencyService } = createMocks();

          const correctSum = breakdown.reduce((sum, m) => sum + m.amountPaise, 0);
          const offByOne = correctSum + offset;

          // Skip if offByOne happens to equal correctSum (impossible with ±1) or is non-positive
          if (offByOne <= 0 || offByOne === correctSum) return;

          mockIdempotencyService.find.mockResolvedValue(null);
          mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });

          await expect(
            service.postGroupCollection(
              groupId,
              {
                totalAmountPaise: offByOne,
                collectionDate: '2024-06-15',
                paymentMode: 'cash' as never,
                idempotencyKey: `key-${crypto.randomUUID()}`,
                memberBreakdown: breakdown,
              },
              'actor1',
              'collection_officer',
            ),
          ).rejects.toThrow(BusinessRuleError);
        },
      ),
      { numRuns: 200 },
    );
  });
});


// ── Generators for batch consistency tests ───────────────────────────────────

interface BreakdownItem {
  loanId: string;
  amountPaise: number;
}

/**
 * Generates a member breakdown with unique loan IDs (no duplicates).
 * Each member has a distinct loanId and a positive amountPaise.
 */
const uniqueMemberBreakdownArb: fc.Arbitrary<BreakdownItem[]> = fc
  .uniqueArray(
    fc.record({
      loanId: uuidArb,
      amountPaise: amountPaiseArb,
    }),
    { minLength: 1, maxLength: 15, selector: (item) => item.loanId },
  );

// ── Property 41: Batch Collection Per-Member Dispatch ────────────────────────

describe('Property 41: Batch Collection Per-Member Dispatch', () => {
  /**
   * **Validates: Requirements 28.4**
   *
   * For any valid group collection, postCollection is called exactly once
   * per member in the breakdown with the correct loanId and amountPaise.
   */
  it('postCollection is called exactly once per member with correct loanId and amountPaise', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueMemberBreakdownArb,
        uuidArb,
        async (breakdown: BreakdownItem[], groupId: string) => {
          const { service, mockGroupRepository, mockIdempotencyService, mockCollectionService } = createMocks();

          const correctSum = breakdown.reduce((sum: number, m: BreakdownItem) => sum + m.amountPaise, 0);

          mockIdempotencyService.find.mockResolvedValue(null);
          mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
          mockGroupRepository.getGroupLoanSummaries.mockResolvedValue(
            breakdown.map((m: BreakdownItem) => ({ id: m.loanId, loan_number: `LN-${m.loanId}` })),
          );
          mockGroupRepository.createGroupCollection.mockResolvedValue({ id: 'gc-1' });
          mockCollectionService.executeCollection.mockResolvedValue({ collectionId: 'c-1' });
          mockIdempotencyService.store.mockResolvedValue({});

          await service.postGroupCollection(
            groupId,
            {
              totalAmountPaise: correctSum,
              collectionDate: '2024-06-15',
              paymentMode: 'cash' as never,
              idempotencyKey: `key-${crypto.randomUUID()}`,
              memberBreakdown: breakdown,
            },
            'actor1',
            'collection_officer',
          );

          // Exactly N calls — one per member
          expect(mockCollectionService.executeCollection).toHaveBeenCalledTimes(breakdown.length);

          // Each member's loanId and amountPaise appear in exactly one call.
          // executeCollection signature: (tx, dto, actorId, actorRole) — dto
          // is the SECOND positional argument.
          const calls = mockCollectionService.executeCollection.mock.calls;
          for (const member of breakdown) {
            const matchingCall = calls.find(
              (c: unknown[]) =>
                (c[1] as { loanId: string; amountPaise: number }).loanId === member.loanId &&
                (c[1] as { loanId: string; amountPaise: number }).amountPaise === member.amountPaise,
            );
            expect(matchingCall).toBeDefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 28.4**
   *
   * The sum of all individual postCollection amountPaise values equals
   * the total group collection amount.
   */
  it('sum of dispatched individual amounts equals total group collection amount', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueMemberBreakdownArb,
        uuidArb,
        async (breakdown: BreakdownItem[], groupId: string) => {
          const { service, mockGroupRepository, mockIdempotencyService, mockCollectionService } = createMocks();

          const correctSum = breakdown.reduce((sum: number, m: BreakdownItem) => sum + m.amountPaise, 0);

          mockIdempotencyService.find.mockResolvedValue(null);
          mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
          mockGroupRepository.getGroupLoanSummaries.mockResolvedValue(
            breakdown.map((m: BreakdownItem) => ({ id: m.loanId, loan_number: `LN-${m.loanId}` })),
          );
          mockGroupRepository.createGroupCollection.mockResolvedValue({ id: 'gc-1' });
          mockCollectionService.executeCollection.mockResolvedValue({ collectionId: 'c-1' });
          mockIdempotencyService.store.mockResolvedValue({});

          await service.postGroupCollection(
            groupId,
            {
              totalAmountPaise: correctSum,
              collectionDate: '2024-06-15',
              paymentMode: 'cash' as never,
              idempotencyKey: `key-${crypto.randomUUID()}`,
              memberBreakdown: breakdown,
            },
            'actor1',
            'collection_officer',
          );

          // Sum of all dispatched amounts must equal total.
          // executeCollection signature: (tx, dto, actorId, actorRole) — dto
          // is the SECOND positional argument.
          const calls = mockCollectionService.executeCollection.mock.calls;
          const dispatchedSum = calls.reduce(
            (sum: number, c: unknown[]) => sum + (c[1] as { amountPaise: number }).amountPaise,
            0,
          );
          expect(dispatchedSum).toBe(correctSum);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 28.4**
   *
   * Each member collection uses a deterministic idempotency key derived
   * from the group collection's idempotency key and the member's loanId.
   */
  it('each member collection receives a deterministic idempotency key', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueMemberBreakdownArb,
        uuidArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        async (breakdown: BreakdownItem[], groupId: string, baseKey: string) => {
          const { service, mockGroupRepository, mockIdempotencyService, mockCollectionService } = createMocks();

          const correctSum = breakdown.reduce((sum: number, m: BreakdownItem) => sum + m.amountPaise, 0);

          mockIdempotencyService.find.mockResolvedValue(null);
          mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
          mockGroupRepository.getGroupLoanSummaries.mockResolvedValue(
            breakdown.map((m: BreakdownItem) => ({ id: m.loanId, loan_number: `LN-${m.loanId}` })),
          );
          mockGroupRepository.createGroupCollection.mockResolvedValue({ id: 'gc-1' });
          mockCollectionService.executeCollection.mockResolvedValue({ collectionId: 'c-1' });
          mockIdempotencyService.store.mockResolvedValue({});

          await service.postGroupCollection(
            groupId,
            {
              totalAmountPaise: correctSum,
              collectionDate: '2024-06-15',
              paymentMode: 'cash' as never,
              idempotencyKey: baseKey,
              memberBreakdown: breakdown,
            },
            'actor1',
            'collection_officer',
          );

          // Each member's idempotency key follows the pattern: {baseKey}__member__{loanId}.
          // executeCollection signature: (tx, dto, actorId, actorRole) — dto
          // is the SECOND positional argument.
          const calls = mockCollectionService.executeCollection.mock.calls;
          for (const member of breakdown) {
            const expectedKey = `${baseKey}__member__${member.loanId}`;
            const matchingCall = calls.find(
              (c: unknown[]) =>
                (c[1] as { idempotencyKey: string }).idempotencyKey === expectedKey,
            );
            expect(matchingCall).toBeDefined();
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ── Property 42: Batch Collection Atomicity ──────────────────────────────────

describe('Property 42: Batch Collection Atomicity', () => {
  /**
   * **Validates: Requirements 29.1**
   *
   * If any individual member's collection fails, the entire group collection
   * transaction rejects. The transaction wrapper ensures atomicity.
   */
  it('if any member collection fails, the entire group collection fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueMemberBreakdownArb.filter((b: BreakdownItem[]) => b.length >= 2),
        uuidArb,
        fc.integer({ min: 0, max: 14 }),
        async (breakdown: BreakdownItem[], groupId: string, failIndexRaw: number) => {
          const failIndex = failIndexRaw % breakdown.length;
          const { service, mockGroupRepository, mockIdempotencyService, mockCollectionService, mockPrisma } = createMocks();

          const correctSum = breakdown.reduce((sum: number, m: BreakdownItem) => sum + m.amountPaise, 0);

          // Make the transaction propagate errors (simulating real Prisma $transaction)
          mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
            return fn({});
          });

          mockIdempotencyService.find.mockResolvedValue(null);
          mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
          mockGroupRepository.getGroupLoanSummaries.mockResolvedValue(
            breakdown.map((m: BreakdownItem) => ({ id: m.loanId, loan_number: `LN-${m.loanId}` })),
          );
          mockGroupRepository.createGroupCollection.mockResolvedValue({ id: 'gc-1' });
          mockIdempotencyService.store.mockResolvedValue({});

          // Make the Nth member's collection fail
          let callCount = 0;
          mockCollectionService.executeCollection.mockImplementation(async () => {
            const currentCall = callCount++;
            if (currentCall === failIndex) {
              throw new Error('Simulated member collection failure');
            }
            return { collectionId: `c-${currentCall}` };
          });

          // The entire group collection should fail
          await expect(
            service.postGroupCollection(
              groupId,
              {
                totalAmountPaise: correctSum,
                collectionDate: '2024-06-15',
                paymentMode: 'cash' as never,
                idempotencyKey: `key-${crypto.randomUUID()}`,
                memberBreakdown: breakdown,
              },
              'actor1',
              'collection_officer',
            ),
          ).rejects.toThrow();

          // Idempotency store should NOT have been called (transaction rolled back)
          expect(mockIdempotencyService.store).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * **Validates: Requirements 29.1**
   *
   * When all member collections succeed, the group collection record is
   * created and the result contains all member results with correct amounts.
   */
  it('successful batch creates group collection record with all member results', async () => {
    await fc.assert(
      fc.asyncProperty(
        uniqueMemberBreakdownArb,
        uuidArb,
        async (breakdown: BreakdownItem[], groupId: string) => {
          const { service, mockGroupRepository, mockIdempotencyService, mockCollectionService } = createMocks();

          const correctSum = breakdown.reduce((sum: number, m: BreakdownItem) => sum + m.amountPaise, 0);

          mockIdempotencyService.find.mockResolvedValue(null);
          mockGroupRepository.findById.mockResolvedValue({ id: groupId, status: 'active' });
          mockGroupRepository.getGroupLoanSummaries.mockResolvedValue(
            breakdown.map((m: BreakdownItem) => ({ id: m.loanId, loan_number: `LN-${m.loanId}` })),
          );
          mockGroupRepository.createGroupCollection.mockResolvedValue({ id: 'gc-1' });
          mockCollectionService.executeCollection.mockResolvedValue({ collectionId: 'c-1' });
          mockIdempotencyService.store.mockResolvedValue({});

          const result = await service.postGroupCollection(
            groupId,
            {
              totalAmountPaise: correctSum,
              collectionDate: '2024-06-15',
              paymentMode: 'cash' as never,
              idempotencyKey: `key-${crypto.randomUUID()}`,
              memberBreakdown: breakdown,
            },
            'actor1',
            'collection_officer',
          );

          // Group collection record was created
          expect(mockGroupRepository.createGroupCollection).toHaveBeenCalledOnce();

          // Result contains all member results
          expect(result.statusCode).toBe(201);
          const data = result.data as {
            memberResults: Array<{ loanId: string; amountPaise: number }>;
            totalAmountPaise: number;
          };
          expect(data.memberResults).toHaveLength(breakdown.length);
          expect(data.totalAmountPaise).toBe(correctSum);

          // Each member result has the correct loanId and amountPaise
          for (const member of breakdown) {
            const memberResult = data.memberResults.find(
              (r) => r.loanId === member.loanId,
            );
            expect(memberResult).toBeDefined();
            expect(memberResult!.amountPaise).toBe(member.amountPaise);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
