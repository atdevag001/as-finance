import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupService } from '../group.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';
import { PaymentMode } from '@as-finance/shared';

/**
 * Integration tests for group collection flow.
 * Tests: group creation → member loans → group collection with member breakdown → individual receipts.
 *
 * Validates: Requirements 11.4, 11.5, 11.7, 29.1, 29.2, 29.3
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

let postCollectionCallCount = 0;

function createMockGroupRepo() {
  return {
    customerExists: vi.fn().mockResolvedValue(true),
    createGroup: vi.fn().mockResolvedValue({ id: 'grp-1', name: 'Test Group', status: 'active' }),
    addMember: vi.fn().mockResolvedValue({ id: 'mem-1' }),
    findById: vi.fn().mockResolvedValue({
      id: 'grp-1', name: 'Test Group', status: 'active',
      leader_id: 'cust-1', leader: { id: 'cust-1', full_name: 'Leader' },
      members: [],
    }),
    isActiveMember: vi.fn().mockResolvedValue(false),
    countActiveMembers: vi.fn().mockResolvedValue(5),
    getGroupMemberLoans: vi.fn().mockResolvedValue([
      { id: 'loan-1' }, { id: 'loan-2' },
    ]),
    createGroupCollection: vi.fn().mockResolvedValue({ id: 'gc-1' }),
    getGroupSummaryData: vi.fn(),
    findMemberById: vi.fn(),
    deactivateMember: vi.fn(),
    hasActiveGroupLoans: vi.fn(),
    findAll: vi.fn(),
    lockGroupForUpdate: vi.fn().mockResolvedValue({ id: 'grp-1' }),
  };
}

function createMockDeps() {
  return {
    prisma: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
    collectionService: {
      postCollection: vi.fn().mockImplementation((dto: { loanId: string; amountPaise: number }) => {
        postCollectionCallCount++;
        return Promise.resolve({
          statusCode: 201,
          data: {
            collectionId: `col-${postCollectionCallCount}`,
            receiptNumber: `RCP-${String(postCollectionCallCount).padStart(3, '0')}`,
            loanId: dto.loanId,
            amountPaise: dto.amountPaise,
          },
        });
      }),
    },
    audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
    idempotency: { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) },
  };
}

describe('Group Collection Integration', () => {
  let service: GroupService;
  let repo: ReturnType<typeof createMockGroupRepo>;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    postCollectionCallCount = 0;
    repo = createMockGroupRepo();
    deps = createMockDeps();
    service = new GroupService(
      deps.prisma as never, repo as never, deps.collectionService as never,
      deps.audit as never, deps.idempotency as never,
    );
  });

  // ── Existing: Group creation ───────────────────────────────────────────

  describe('Group creation', () => {
    it('should create group and auto-add leader as first member', async () => {
      const group = await service.createGroup(
        { name: 'Village Group', meetingDay: 'monday', branchArea: 'Area-1', leaderId: 'cust-1' },
        'user-1', 'field_officer',
      );

      expect(group.id).toBe('grp-1');
      expect(repo.createGroup).toHaveBeenCalled();
      expect(repo.addMember).toHaveBeenCalledWith('grp-1', 'cust-1', expect.anything());
      expect(deps.audit.createAuditLog).toHaveBeenCalled();
    });

    it('should reject group creation with non-existent leader', async () => {
      repo.customerExists.mockResolvedValue(false);

      await expect(
        service.createGroup(
          { name: 'Bad Group', meetingDay: 'monday', branchArea: 'Area-1', leaderId: 'nonexistent' },
          'user-1', 'field_officer',
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── Existing: Group collection posting basics ──────────────────────────

  describe('Group collection posting', () => {
    it('should post group collection with member breakdown and individual collections', async () => {
      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 20000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 12000 },
            { loanId: 'loan-2', amountPaise: 8000 },
          ],
          collectionDate: '2024-01-15',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-key-1',
        },
        'officer-1', 'collection_officer',
      );

      expect(result.statusCode).toBe(201);
      expect(deps.collectionService.postCollection).toHaveBeenCalledTimes(2);
      expect(repo.createGroupCollection).toHaveBeenCalled();
      expect(deps.audit.createAuditLog).toHaveBeenCalled();
      expect(deps.idempotency.store).toHaveBeenCalled();
    });

    it('should reject when member breakdown sum ≠ total amount', async () => {
      await expect(
        service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 20000,
            memberBreakdown: [
              { loanId: 'loan-1', amountPaise: 12000 },
              { loanId: 'loan-2', amountPaise: 5000 },
            ],
            collectionDate: '2024-01-15',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-key-2',
          },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should reject when loan is not in the group', async () => {
      await expect(
        service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 10000,
            memberBreakdown: [
              { loanId: 'loan-999', amountPaise: 10000 },
            ],
            collectionDate: '2024-01-15',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-key-3',
          },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should return cached result for duplicate idempotency key', async () => {
      deps.idempotency.find.mockResolvedValue({ resultStatus: 201, resultBody: { groupCollectionId: 'cached' } });

      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 10000,
          memberBreakdown: [{ loanId: 'loan-1', amountPaise: 10000 }],
          collectionDate: '2024-01-15',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'dup-gc-key',
        },
        'officer-1', 'collection_officer',
      );

      expect(result.data).toEqual({ groupCollectionId: 'cached' });
    });

    it('should reject collection for inactive group', async () => {
      repo.findById.mockResolvedValue({ id: 'grp-1', status: 'dissolved' });

      await expect(
        service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 10000,
            memberBreakdown: [{ loanId: 'loan-1', amountPaise: 10000 }],
            collectionDate: '2024-01-15',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-key-4',
          },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });
  });

  // ── Req 29.1: Individual collections per member with allocations, receipts, journal entries ──

  describe('Req 29.1 — Individual collections per member', () => {
    it('should post one individual collection per member in the breakdown', async () => {
      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 30000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 18000 },
            { loanId: 'loan-2', amountPaise: 12000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-ind-1',
        },
        'officer-1', 'collection_officer',
      );

      expect(result.statusCode).toBe(201);
      // Exactly one postCollection call per member
      expect(deps.collectionService.postCollection).toHaveBeenCalledTimes(2);
    });

    it('should pass correct loan ID and amount to each individual collection', async () => {
      await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 30000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 18000 },
            { loanId: 'loan-2', amountPaise: 12000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-ind-2',
        },
        'officer-1', 'collection_officer',
      );

      const call1 = deps.collectionService.postCollection.mock.calls[0]![0];
      expect(call1.loanId).toBe('loan-1');
      expect(call1.amountPaise).toBe(18000);
      expect(call1.paymentMode).toBe(PaymentMode.CASH);
      expect(call1.paymentDate).toBe('2024-02-01');

      const call2 = deps.collectionService.postCollection.mock.calls[1]![0];
      expect(call2.loanId).toBe('loan-2');
      expect(call2.amountPaise).toBe(12000);
      expect(call2.paymentMode).toBe(PaymentMode.CASH);
      expect(call2.paymentDate).toBe('2024-02-01');
    });

    it('should generate deterministic per-member idempotency keys', async () => {
      await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 30000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 18000 },
            { loanId: 'loan-2', amountPaise: 12000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-parent-key',
        },
        'officer-1', 'collection_officer',
      );

      const key1 = deps.collectionService.postCollection.mock.calls[0]![0].idempotencyKey;
      const key2 = deps.collectionService.postCollection.mock.calls[1]![0].idempotencyKey;

      // Each member gets a unique deterministic key derived from the parent key
      expect(key1).toContain('gc-parent-key');
      expect(key2).toContain('gc-parent-key');
      expect(key1).not.toBe(key2);
      expect(key1).toContain('loan-1');
      expect(key2).toContain('loan-2');
    });

    it('should return individual member results in the response', async () => {
      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 30000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 18000 },
            { loanId: 'loan-2', amountPaise: 12000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-ind-results',
        },
        'officer-1', 'collection_officer',
      );

      const data = result.data as Record<string, unknown>;
      const memberResults = data['memberResults'] as Array<{
        loanId: string;
        amountPaise: number;
        collectionResult: unknown;
      }>;

      expect(memberResults).toHaveLength(2);
      expect(memberResults[0]!.loanId).toBe('loan-1');
      expect(memberResults[0]!.amountPaise).toBe(18000);
      expect(memberResults[0]!.collectionResult).toBeDefined();
      expect(memberResults[1]!.loanId).toBe('loan-2');
      expect(memberResults[1]!.amountPaise).toBe(12000);
      expect(memberResults[1]!.collectionResult).toBeDefined();
    });

    it('should create group collection record with correct metadata', async () => {
      await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 30000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 18000 },
            { loanId: 'loan-2', amountPaise: 12000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-ind-meta',
        },
        'officer-1', 'collection_officer',
      );

      expect(repo.createGroupCollection).toHaveBeenCalledTimes(1);
      const gcData = repo.createGroupCollection.mock.calls[0]![0];
      expect(gcData.group_id).toBe('grp-1');
      expect(gcData.total_amount_paise).toBe(30000);
      expect(gcData.collected_by).toBe('officer-1');
      expect(gcData.idempotency_key).toBe('gc-ind-meta');
      expect(gcData.member_breakdown).toHaveLength(2);
    });

    it('should create audit log with group collection details', async () => {
      await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 30000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 18000 },
            { loanId: 'loan-2', amountPaise: 12000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-ind-audit',
        },
        'officer-1', 'collection_officer',
      );

      expect(deps.audit.createAuditLog).toHaveBeenCalledTimes(1);
      const auditCall = deps.audit.createAuditLog.mock.calls[0]![0];
      expect(auditCall.action_type).toBe('collection_posted');
      expect(auditCall.actor_id).toBe('officer-1');
      expect(auditCall.actor_role).toBe('collection_officer');
      expect(auditCall.target_entity).toBe('group_collection');
      expect(auditCall.after_state.group_id).toBe('grp-1');
      expect(auditCall.after_state.total_amount_paise).toBe(30000);
      expect(auditCall.after_state.member_count).toBe(2);
    });

    it('should store idempotency result with complete group collection data', async () => {
      await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 30000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 18000 },
            { loanId: 'loan-2', amountPaise: 12000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-ind-idem',
        },
        'officer-1', 'collection_officer',
      );

      expect(deps.idempotency.store).toHaveBeenCalledTimes(1);
      const storeArgs = deps.idempotency.store.mock.calls[0]!;
      expect(storeArgs[0]).toBe('gc-ind-idem');
      expect(storeArgs[1]).toBe('group_collection');
      expect(storeArgs[2]).toBe(201);
      const resultBody = storeArgs[3];
      expect(resultBody.groupId).toBe('grp-1');
      expect(resultBody.totalAmountPaise).toBe(30000);
      expect(resultBody.memberResults).toHaveLength(2);
    });

    it('should handle single-member group collection', async () => {
      repo.getGroupMemberLoans.mockResolvedValue([{ id: 'loan-1' }]);

      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 15000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 15000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-single',
        },
        'officer-1', 'collection_officer',
      );

      expect(result.statusCode).toBe(201);
      expect(deps.collectionService.postCollection).toHaveBeenCalledTimes(1);
    });
  });

  // ── Req 29.2: Atomicity — one member failure → entire batch rollback ───

  describe('Req 29.2 — Atomicity: one member failure rolls back entire batch', () => {
    it('should roll back entire batch when second member collection fails', async () => {
      // First member succeeds, second member fails
      deps.collectionService.postCollection
        .mockResolvedValueOnce({
          statusCode: 201,
          data: { collectionId: 'col-1', receiptNumber: 'RCP-001' },
        })
        .mockRejectedValueOnce(new BusinessRuleError('Loan not active', 'LOAN_NOT_ACTIVE'));

      await expect(
        service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 20000,
            memberBreakdown: [
              { loanId: 'loan-1', amountPaise: 12000 },
              { loanId: 'loan-2', amountPaise: 8000 },
            ],
            collectionDate: '2024-02-01',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-atomic-1',
          },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow(BusinessRuleError);

      // Since the transaction threw, idempotency should NOT be stored
      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back entire batch when first member collection fails', async () => {
      deps.collectionService.postCollection
        .mockRejectedValueOnce(new Error('DB connection lost'));

      await expect(
        service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 20000,
            memberBreakdown: [
              { loanId: 'loan-1', amountPaise: 12000 },
              { loanId: 'loan-2', amountPaise: 8000 },
            ],
            collectionDate: '2024-02-01',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-atomic-2',
          },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow('DB connection lost');

      // Second member collection should never have been attempted
      expect(deps.collectionService.postCollection).toHaveBeenCalledTimes(1);
      // No group collection record, no audit, no idempotency
      expect(repo.createGroupCollection).toHaveBeenCalledTimes(1); // called before member loop
      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when group collection record creation fails', async () => {
      repo.createGroupCollection.mockRejectedValue(new Error('Insert failed'));

      await expect(
        service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 20000,
            memberBreakdown: [
              { loanId: 'loan-1', amountPaise: 12000 },
              { loanId: 'loan-2', amountPaise: 8000 },
            ],
            collectionDate: '2024-02-01',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-atomic-3',
          },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow('Insert failed');

      // No individual collections should have been posted (group record is created first)
      expect(deps.collectionService.postCollection).not.toHaveBeenCalled();
      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when audit log creation fails after successful member collections', async () => {
      deps.audit.createAuditLog.mockRejectedValue(new Error('Audit service down'));

      await expect(
        service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 20000,
            memberBreakdown: [
              { loanId: 'loan-1', amountPaise: 12000 },
              { loanId: 'loan-2', amountPaise: 8000 },
            ],
            collectionDate: '2024-02-01',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-atomic-4',
          },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow('Audit service down');

      // Even though member collections succeeded, the transaction should roll back
      // so no idempotency result is stored
      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when idempotency store fails after all steps succeed', async () => {
      deps.idempotency.store.mockRejectedValue(new Error('Idempotency store failed'));

      await expect(
        service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 20000,
            memberBreakdown: [
              { loanId: 'loan-1', amountPaise: 12000 },
              { loanId: 'loan-2', amountPaise: 8000 },
            ],
            collectionDate: '2024-02-01',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-atomic-5',
          },
          'officer-1', 'collection_officer',
        ),
      ).rejects.toThrow('Idempotency store failed');
    });

    it('should propagate the original error from the failing member collection', async () => {
      deps.collectionService.postCollection
        .mockResolvedValueOnce({
          statusCode: 201,
          data: { collectionId: 'col-1', receiptNumber: 'RCP-001' },
        })
        .mockRejectedValueOnce(
          new BusinessRuleError('Collection exceeds outstanding', 'EXCESS_COLLECTION'),
        );

      try {
        await service.postGroupCollection(
          'grp-1',
          {
            totalAmountPaise: 20000,
            memberBreakdown: [
              { loanId: 'loan-1', amountPaise: 12000 },
              { loanId: 'loan-2', amountPaise: 8000 },
            ],
            collectionDate: '2024-02-01',
            paymentMode: PaymentMode.CASH,
            idempotencyKey: 'gc-atomic-6',
          },
          'officer-1', 'collection_officer',
        );
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessRuleError);
        expect((err as BusinessRuleError).message).toContain('Collection exceeds outstanding');
      }
    });
  });

  // ── Req 29.3: Mixed member statuses (active + overdue) ─────────────────

  describe('Req 29.3 — Mixed member statuses (active + overdue)', () => {
    beforeEach(() => {
      // Group has loans with mixed statuses: loan-1 is active, loan-2 is overdue
      repo.getGroupMemberLoans.mockResolvedValue([
        { id: 'loan-1', status: 'active' },
        { id: 'loan-2', status: 'overdue' },
      ]);
    });

    it('should accept group collection when members have mixed active/overdue statuses', async () => {
      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 25000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 15000 },
            { loanId: 'loan-2', amountPaise: 10000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-mixed-1',
        },
        'officer-1', 'collection_officer',
      );

      expect(result.statusCode).toBe(201);
      // Both members should have individual collections posted
      expect(deps.collectionService.postCollection).toHaveBeenCalledTimes(2);
    });

    it('should post individual collection for active member with correct params', async () => {
      await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 25000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 15000 },
            { loanId: 'loan-2', amountPaise: 10000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-mixed-2',
        },
        'officer-1', 'collection_officer',
      );

      const activeLoanCall = deps.collectionService.postCollection.mock.calls[0]![0];
      expect(activeLoanCall.loanId).toBe('loan-1');
      expect(activeLoanCall.amountPaise).toBe(15000);
    });

    it('should post individual collection for overdue member with correct params', async () => {
      await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 25000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 15000 },
            { loanId: 'loan-2', amountPaise: 10000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-mixed-3',
        },
        'officer-1', 'collection_officer',
      );

      const overdueLoanCall = deps.collectionService.postCollection.mock.calls[1]![0];
      expect(overdueLoanCall.loanId).toBe('loan-2');
      expect(overdueLoanCall.amountPaise).toBe(10000);
    });

    it('should return results for both active and overdue members', async () => {
      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 25000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 15000 },
            { loanId: 'loan-2', amountPaise: 10000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-mixed-4',
        },
        'officer-1', 'collection_officer',
      );

      const data = result.data as Record<string, unknown>;
      const memberResults = data['memberResults'] as Array<{
        loanId: string;
        amountPaise: number;
        collectionResult: unknown;
      }>;

      expect(memberResults).toHaveLength(2);
      // Active member result
      expect(memberResults[0]!.loanId).toBe('loan-1');
      expect(memberResults[0]!.amountPaise).toBe(15000);
      expect(memberResults[0]!.collectionResult).toBeDefined();
      // Overdue member result
      expect(memberResults[1]!.loanId).toBe('loan-2');
      expect(memberResults[1]!.amountPaise).toBe(10000);
      expect(memberResults[1]!.collectionResult).toBeDefined();
    });

    it('should handle group with all overdue members', async () => {
      repo.getGroupMemberLoans.mockResolvedValue([
        { id: 'loan-1', status: 'overdue' },
        { id: 'loan-2', status: 'overdue' },
      ]);

      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 20000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 12000 },
            { loanId: 'loan-2', amountPaise: 8000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.CASH,
          idempotencyKey: 'gc-all-overdue',
        },
        'officer-1', 'collection_officer',
      );

      expect(result.statusCode).toBe(201);
      expect(deps.collectionService.postCollection).toHaveBeenCalledTimes(2);
    });

    it('should support bank_transfer payment mode for mixed-status group', async () => {
      const result = await service.postGroupCollection(
        'grp-1',
        {
          totalAmountPaise: 25000,
          memberBreakdown: [
            { loanId: 'loan-1', amountPaise: 15000 },
            { loanId: 'loan-2', amountPaise: 10000 },
          ],
          collectionDate: '2024-02-01',
          paymentMode: PaymentMode.BANK_TRANSFER,
          idempotencyKey: 'gc-mixed-bank',
        },
        'officer-1', 'collection_officer',
      );

      expect(result.statusCode).toBe(201);
      // Verify payment mode passed through to individual collections
      const call1 = deps.collectionService.postCollection.mock.calls[0]![0];
      const call2 = deps.collectionService.postCollection.mock.calls[1]![0];
      expect(call1.paymentMode).toBe(PaymentMode.BANK_TRANSFER);
      expect(call2.paymentMode).toBe(PaymentMode.BANK_TRANSFER);
    });
  });
});
