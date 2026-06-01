import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GroupService } from '../group.service';

// ── Mocks ────────────────────────────────────────────────────────────────────

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
  getGroupSummaryData: vi.fn(),
};

const mockCollectionService = {
  postCollection: vi.fn(),
};

const mockAuditService = {
  createAuditLog: vi.fn(),
};

const mockIdempotencyService = {
  find: vi.fn(),
  store: vi.fn(),
};

const mockPrisma = {
  $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({})),
  group_collections: {
    findMany: vi.fn().mockResolvedValue([]),
  },
};

function createService() {
  return new GroupService(
    mockPrisma as never,
    mockGroupRepository as never,
    mockCollectionService as never,
    mockAuditService as never,
    mockIdempotencyService as never,
  );
}

describe('GroupService', () => {
  let service: GroupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = createService();
  });

  // ── createGroup ──────────────────────────────────────────────────────────

  describe('createGroup', () => {
    it('should create a group and auto-add leader as member', async () => {
      mockGroupRepository.customerExists.mockResolvedValue(true);
      mockGroupRepository.createGroup.mockResolvedValue({ id: 'g1', name: 'Test Group' });
      mockGroupRepository.addMember.mockResolvedValue({ id: 'm1' });
      mockAuditService.createAuditLog.mockResolvedValue({});

      const result = await service.createGroup(
        { name: 'Test Group', meetingDay: 'monday', branchArea: 'Area 1', leaderId: 'c1' },
        'user1',
        'field_officer',
      );

      expect(result).toEqual({ id: 'g1', name: 'Test Group' });
      expect(mockGroupRepository.createGroup).toHaveBeenCalledOnce();
      expect(mockGroupRepository.addMember).toHaveBeenCalledWith(
        'g1',
        'c1',
        expect.anything(),
      );
    });

    it('should reject if leader customer does not exist', async () => {
      mockGroupRepository.customerExists.mockResolvedValue(false);

      await expect(
        service.createGroup(
          { name: 'Test', meetingDay: 'monday', branchArea: 'Area', leaderId: 'bad-id' },
          'user1',
          'field_officer',
        ),
      ).rejects.toThrow('Customer not found for group leader');
    });
  });

  // ── addMember ────────────────────────────────────────────────────────────

  describe('addMember', () => {
    const activeGroup = {
      id: 'g1',
      status: 'active',
      members: [],
    };

    it('should add a member when under max size', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.customerExists.mockResolvedValue(true);
      mockGroupRepository.isActiveMember.mockResolvedValue(false);
      mockGroupRepository.countActiveMembers.mockResolvedValue(10);
      mockGroupRepository.addMember.mockResolvedValue({ id: 'm1' });
      mockAuditService.createAuditLog.mockResolvedValue({});

      const result = await service.addMember('g1', { customerId: 'c2' }, 'user1', 'field_officer');
      expect(result).toEqual({ id: 'm1' });
    });

    it('should reject when group is at max size (15)', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.customerExists.mockResolvedValue(true);
      mockGroupRepository.isActiveMember.mockResolvedValue(false);
      mockGroupRepository.countActiveMembers.mockResolvedValue(15);

      await expect(
        service.addMember('g1', { customerId: 'c2' }, 'user1', 'field_officer'),
      ).rejects.toThrow('maximum size of 15');
    });

    it('should reject duplicate member', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.customerExists.mockResolvedValue(true);
      mockGroupRepository.isActiveMember.mockResolvedValue(true);

      await expect(
        service.addMember('g1', { customerId: 'c2' }, 'user1', 'field_officer'),
      ).rejects.toThrow('already an active member');
    });

    it('should reject when group is not active', async () => {
      mockGroupRepository.findById.mockResolvedValue({ ...activeGroup, status: 'dissolved' });

      await expect(
        service.addMember('g1', { customerId: 'c2' }, 'user1', 'field_officer'),
      ).rejects.toThrow('Cannot add members to a group');
    });

    it('should reject when customer does not exist', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.customerExists.mockResolvedValue(false);

      await expect(
        service.addMember('g1', { customerId: 'bad' }, 'user1', 'field_officer'),
      ).rejects.toThrow('Customer not found');
    });
  });

  // ── removeMember ─────────────────────────────────────────────────────────

  describe('removeMember', () => {
    const activeGroup = { id: 'g1', status: 'active', members: [] };
    const activeMember = {
      id: 'm1',
      group_id: 'g1',
      customer_id: 'c1',
      is_active: true,
      customer: { id: 'c1', full_name: 'Test' },
    };

    it('should remove a member when above min size and no active loans', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.findMemberById.mockResolvedValue(activeMember);
      mockGroupRepository.countActiveMembers.mockResolvedValue(6);
      mockGroupRepository.hasActiveGroupLoans.mockResolvedValue(false);
      mockGroupRepository.deactivateMember.mockResolvedValue({});
      mockAuditService.createAuditLog.mockResolvedValue({});

      const result = await service.removeMember('g1', 'm1', 'user1', 'manager');
      expect(result).toEqual({ success: true });
      expect(mockGroupRepository.deactivateMember).toHaveBeenCalledWith('m1');
    });

    it('should reject when group would fall below min size (5)', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.findMemberById.mockResolvedValue(activeMember);
      mockGroupRepository.countActiveMembers.mockResolvedValue(5);

      await expect(
        service.removeMember('g1', 'm1', 'user1', 'manager'),
      ).rejects.toThrow('minimum size of 5');
    });

    it('should reject when member has active loans', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.findMemberById.mockResolvedValue(activeMember);
      mockGroupRepository.countActiveMembers.mockResolvedValue(10);
      mockGroupRepository.hasActiveGroupLoans.mockResolvedValue(true);

      await expect(
        service.removeMember('g1', 'm1', 'user1', 'manager'),
      ).rejects.toThrow('active loans');
    });

    it('should reject when member is already inactive', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.findMemberById.mockResolvedValue({ ...activeMember, is_active: false });

      await expect(
        service.removeMember('g1', 'm1', 'user1', 'manager'),
      ).rejects.toThrow('already inactive');
    });

    it('should perform soft removal by calling deactivateMember (sets left_at and is_active=false)', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.findMemberById.mockResolvedValue(activeMember);
      mockGroupRepository.countActiveMembers.mockResolvedValue(8);
      mockGroupRepository.hasActiveGroupLoans.mockResolvedValue(false);
      mockGroupRepository.deactivateMember.mockResolvedValue({
        ...activeMember,
        is_active: false,
        left_at: new Date(),
      });
      mockAuditService.createAuditLog.mockResolvedValue({});

      await service.removeMember('g1', 'm1', 'user1', 'manager');

      expect(mockGroupRepository.deactivateMember).toHaveBeenCalledWith('m1');
      // Audit log captures before/after state reflecting soft removal
      expect(mockAuditService.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          before_state: expect.objectContaining({ active: true }),
          after_state: expect.objectContaining({ active: false }),
        }),
      );
    });

    it('should reject when group is not found', async () => {
      mockGroupRepository.findById.mockResolvedValue(null);

      await expect(
        service.removeMember('g1', 'm1', 'user1', 'manager'),
      ).rejects.toThrow('Group not found');
    });

    it('should reject when member is not found in group', async () => {
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.findMemberById.mockResolvedValue(null);

      await expect(
        service.removeMember('g1', 'm1', 'user1', 'manager'),
      ).rejects.toThrow('Member not found in group');
    });
  });

  // ── postGroupCollection ──────────────────────────────────────────────────

  describe('postGroupCollection', () => {
    const activeGroup = { id: 'g1', status: 'active', members: [] };

    it('should reject when member breakdown sum does not equal total', async () => {
      mockIdempotencyService.find.mockResolvedValue(null);
      mockGroupRepository.findById.mockResolvedValue(activeGroup);

      await expect(
        service.postGroupCollection(
          'g1',
          {
            totalAmountPaise: 10000,
            collectionDate: '2024-06-15',
            paymentMode: 'cash' as never,
            idempotencyKey: 'key1',
            memberBreakdown: [
              { loanId: 'l1', amountPaise: 5000 },
              { loanId: 'l2', amountPaise: 3000 },
            ],
          },
          'user1',
          'collection_officer',
        ),
      ).rejects.toThrow('does not equal total amount');
    });

    it('should reject when loan is not in the group', async () => {
      mockIdempotencyService.find.mockResolvedValue(null);
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.getGroupMemberLoans.mockResolvedValue([
        { id: 'l1', loan_number: 'LN-1' },
      ]);

      await expect(
        service.postGroupCollection(
          'g1',
          {
            totalAmountPaise: 10000,
            collectionDate: '2024-06-15',
            paymentMode: 'cash' as never,
            idempotencyKey: 'key1',
            memberBreakdown: [
              { loanId: 'l1', amountPaise: 5000 },
              { loanId: 'l-unknown', amountPaise: 5000 },
            ],
          },
          'user1',
          'collection_officer',
        ),
      ).rejects.toThrow('not an active loan in this group');
    });

    it('should return cached result for duplicate idempotency key', async () => {
      mockIdempotencyService.find.mockResolvedValue({
        resultStatus: 201,
        resultBody: { groupCollectionId: 'gc1' },
      });

      const result = await service.postGroupCollection(
        'g1',
        {
          totalAmountPaise: 10000,
          collectionDate: '2024-06-15',
          paymentMode: 'cash' as never,
          idempotencyKey: 'dup-key',
          memberBreakdown: [{ loanId: 'l1', amountPaise: 10000 }],
        },
        'user1',
        'collection_officer',
      );

      expect(result).toEqual({
        statusCode: 201,
        data: { groupCollectionId: 'gc1' },
      });
      expect(mockGroupRepository.findById).not.toHaveBeenCalled();
    });

    it('should post individual collections for each member', async () => {
      mockIdempotencyService.find.mockResolvedValue(null);
      mockGroupRepository.findById.mockResolvedValue(activeGroup);
      mockGroupRepository.getGroupMemberLoans.mockResolvedValue([
        { id: 'l1', loan_number: 'LN-1' },
        { id: 'l2', loan_number: 'LN-2' },
      ]);
      mockGroupRepository.createGroupCollection.mockResolvedValue({ id: 'gc1' });
      mockCollectionService.postCollection.mockResolvedValue({
        statusCode: 201,
        data: { collectionId: 'c1' },
      });
      mockAuditService.createAuditLog.mockResolvedValue({});
      mockIdempotencyService.store.mockResolvedValue({});

      const result = await service.postGroupCollection(
        'g1',
        {
          totalAmountPaise: 10000,
          collectionDate: '2024-06-15',
          paymentMode: 'cash' as never,
          idempotencyKey: 'key1',
          memberBreakdown: [
            { loanId: 'l1', amountPaise: 6000 },
            { loanId: 'l2', amountPaise: 4000 },
          ],
        },
        'user1',
        'collection_officer',
      );

      expect(result.statusCode).toBe(201);
      expect(mockCollectionService.postCollection).toHaveBeenCalledTimes(2);
      // Verify deterministic idempotency keys for member collections
      expect(mockCollectionService.postCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          loanId: 'l1',
          amountPaise: 6000,
          idempotencyKey: 'key1__member__l1',
        }),
        'user1',
        'collection_officer',
      );
    });

    it('should reject when group is not active', async () => {
      mockIdempotencyService.find.mockResolvedValue(null);
      mockGroupRepository.findById.mockResolvedValue({ ...activeGroup, status: 'inactive' });

      await expect(
        service.postGroupCollection(
          'g1',
          {
            totalAmountPaise: 5000,
            collectionDate: '2024-06-15',
            paymentMode: 'cash' as never,
            idempotencyKey: 'key1',
            memberBreakdown: [{ loanId: 'l1', amountPaise: 5000 }],
          },
          'user1',
          'collection_officer',
        ),
      ).rejects.toThrow('Cannot post collection for group');
    });
  });

  // ── getGroupSummary ──────────────────────────────────────────────────────

  describe('getGroupSummary', () => {
    it('should return summary with delinquency status', async () => {
      mockGroupRepository.getGroupSummaryData.mockResolvedValue({
        id: 'g1',
        name: 'Test Group',
        status: 'active',
        meeting_day: 'monday',
        branch_area: 'Area 1',
        leader: { id: 'c1', full_name: 'Leader' },
        members: [
          {
            id: 'm1',
            customer: {
              id: 'c1',
              full_name: 'Member 1',
              loans: [
                {
                  id: 'l1',
                  loan_number: 'LN-1',
                  status: 'active',
                  cached_outstanding_paise: 50000n,
                  dpd: 0,
                  overdue_bucket: 'bucket_0',
                  total_payable_paise: 100000n,
                },
              ],
            },
          },
          {
            id: 'm2',
            customer: {
              id: 'c2',
              full_name: 'Member 2',
              loans: [
                {
                  id: 'l2',
                  loan_number: 'LN-2',
                  status: 'overdue',
                  cached_outstanding_paise: 30000n,
                  dpd: 15,
                  overdue_bucket: 'bucket_1_30',
                  total_payable_paise: 80000n,
                },
              ],
            },
          },
        ],
        group_collections: [
          { id: 'gc1', total_amount_paise: 20000n, collection_date: new Date() },
        ],
      });

      const summary = await service.getGroupSummary('g1');

      expect(summary.groupId).toBe('g1');
      expect(summary.totalOutstandingPaise).toBe(80000);
      expect(summary.totalCollectedPaise).toBe(20000);
      expect(summary.isGroupDelinquent).toBe(true);
      expect(summary.members).toHaveLength(2);
      expect(summary.members[0]!.isDelinquent).toBe(false);
      expect(summary.members[1]!.isDelinquent).toBe(true);
      expect(summary.members[1]!.maxDpd).toBe(15);
    });

    it('should throw NotFoundError for non-existent group', async () => {
      mockGroupRepository.getGroupSummaryData.mockResolvedValue(null);

      await expect(service.getGroupSummary('bad-id')).rejects.toThrow('Group not found');
    });

    it('should return non-delinquent summary when all members are current', async () => {
      mockGroupRepository.getGroupSummaryData.mockResolvedValue({
        id: 'g1',
        name: 'Good Group',
        status: 'active',
        meeting_day: 'wednesday',
        branch_area: 'Area 2',
        leader: { id: 'c1', full_name: 'Leader' },
        members: [
          {
            id: 'm1',
            customer: {
              id: 'c1',
              full_name: 'Member 1',
              loans: [
                {
                  id: 'l1',
                  loan_number: 'LN-1',
                  status: 'active',
                  cached_outstanding_paise: 40000n,
                  dpd: 0,
                  overdue_bucket: 'bucket_0',
                  total_payable_paise: 100000n,
                },
              ],
            },
          },
        ],
        group_collections: [],
      });

      const summary = await service.getGroupSummary('g1');

      expect(summary.isGroupDelinquent).toBe(false);
      expect(summary.totalCollectedPaise).toBe(0);
      expect(summary.totalOutstandingPaise).toBe(40000);
      expect(summary.members[0]!.isDelinquent).toBe(false);
      expect(summary.members[0]!.maxDpd).toBe(0);
    });
  });

  // ── findById ─────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return group when found', async () => {
      const group = {
        id: 'g1',
        name: 'Test',
        meeting_day: 'monday',
        branch_area: 'area-1',
        status: 'active',
        leader: { full_name: 'Leader Name' },
        members: [],
      };
      mockGroupRepository.findById.mockResolvedValue(group);
      mockGroupRepository.getGroupMemberLoans.mockResolvedValue([]);

      const result = await service.findById('g1');
      // Service transforms repository output into a flat frontend shape
      expect(result.id).toBe('g1');
      expect(result.name).toBe('Test');
      expect(result.status).toBe('active');
      expect(result.leader_name).toBe('Leader Name');
      expect(result.members).toEqual([]);
      expect(result.collections).toEqual([]);
    });

    it('should throw NotFoundError when group does not exist', async () => {
      mockGroupRepository.findById.mockResolvedValue(null);

      await expect(service.findById('bad-id')).rejects.toThrow('Group not found');
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('should delegate to repository with pagination params', async () => {
      mockGroupRepository.findAll.mockResolvedValue({
        data: [
          {
            id: 'g1',
            name: 'Group 1',
            meeting_day: 'monday',
            branch_area: 'area-1',
            status: 'active',
            leader: null,
            members: [],
          },
        ],
        total: 1,
      });

      const result = await service.findAll({ skip: 0, take: 10, status: 'active' });
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(mockGroupRepository.findAll).toHaveBeenCalledWith({ skip: 0, take: 10, status: 'active' });
    });
  });

  // ── Dissolved group rejection (Requirement 28.6) ─────────────────────────

  describe('dissolved group rejection', () => {
    it('should reject addMember for a dissolved group', async () => {
      mockGroupRepository.findById.mockResolvedValue({ id: 'g1', status: 'dissolved', members: [] });

      await expect(
        service.addMember('g1', { customerId: 'c2' }, 'user1', 'field_officer'),
      ).rejects.toThrow("Cannot add members to a group with status 'dissolved'");
    });

    it('should reject postGroupCollection for a dissolved group', async () => {
      mockIdempotencyService.find.mockResolvedValue(null);
      mockGroupRepository.findById.mockResolvedValue({ id: 'g1', status: 'dissolved', members: [] });

      await expect(
        service.postGroupCollection(
          'g1',
          {
            totalAmountPaise: 5000,
            collectionDate: '2024-06-15',
            paymentMode: 'cash' as never,
            idempotencyKey: 'key1',
            memberBreakdown: [{ loanId: 'l1', amountPaise: 5000 }],
          },
          'user1',
          'collection_officer',
        ),
      ).rejects.toThrow("Cannot post collection for group with status 'dissolved'");
    });
  });
});
