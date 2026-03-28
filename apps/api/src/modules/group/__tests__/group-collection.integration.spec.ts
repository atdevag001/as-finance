import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupService } from '../group.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';
import { PaymentMode } from '@as-finance/shared';

/**
 * Integration tests for group collection flow.
 * Tests: group creation → member loans → group collection with member breakdown → individual receipts.
 *
 * Validates: Requirements 11.4, 11.5, 11.7
 */

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
  };
}

function createMockDeps() {
  return {
    prisma: { $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})) },
    collectionService: {
      postCollection: vi.fn().mockResolvedValue({ statusCode: 201, data: { collectionId: 'col-1', receiptNumber: 'RCP-001' } }),
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
    repo = createMockGroupRepo();
    deps = createMockDeps();
    service = new GroupService(
      deps.prisma as never, repo as never, deps.collectionService as never,
      deps.audit as never, deps.idempotency as never,
    );
  });

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
      // Individual collections posted for each member
      expect(deps.collectionService.postCollection).toHaveBeenCalledTimes(2);
      // Group collection record created
      expect(repo.createGroupCollection).toHaveBeenCalled();
      // Audit log created
      expect(deps.audit.createAuditLog).toHaveBeenCalled();
      // Idempotency stored
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
              { loanId: 'loan-2', amountPaise: 5000 }, // sum = 17000 ≠ 20000
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
              { loanId: 'loan-999', amountPaise: 10000 }, // not in group
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
});
