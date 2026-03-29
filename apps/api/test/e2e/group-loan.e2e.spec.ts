import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, createGroup } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Group Loan E2E Tests
 *
 * Verifies group creation, member management, group size constraints,
 * group collection posting with member-wise breakdown, individual receipt
 * generation, and member removal restrictions.
 *
 * Validates: Requirements 11.1–11.6; Properties 16, 32
 */

describe('Group Loan E2E', () => {
  let clients: AuthClients;
  let dbUtils: DbUtils;
  let seedData: SeedData;

  beforeAll(() => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
    seedData = getSeedData();
  });

  /** Extract customer ID from factory response. */
  function custId(c: Record<string, unknown>): string {
    return (c['customer'] as Record<string, unknown>)?.['id'] as string ?? c['id'] as string;
  }

  /** Create a unique idempotency key. */
  function idempKey(prefix = 'e2e-grp'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Helper: create N customers and return their IDs.
   */
  async function createCustomers(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: `Group Test Customer ${Date.now()}-${i}`,
      });
      ids.push(custId(customer));
    }
    return ids;
  }

  /**
   * Helper: create a group with the specified number of members.
   * Creates customers, creates the group with the first customer as leader,
   * then adds remaining customers as members.
   * Returns { groupId, customerIds }.
   */
  async function createGroupWithMembers(memberCount: number) {
    const customerIds = await createCustomers(memberCount);
    const leaderId = customerIds[0]!;

    const group = await createGroup(clients.fieldOfficer, { leaderId });
    const groupId = group['id'] as string;

    // Leader is auto-added as first member; add the rest
    for (let i = 1; i < customerIds.length; i++) {
      await clients.fieldOfficer.post(`/groups/${groupId}/members`).send({
        customerId: customerIds[i],
      });
    }

    return { groupId, customerIds };
  }

  /**
   * Helper: create active loans for group members linked to the group.
   * Returns array of { customerId, loanId }.
   */
  async function createGroupLoans(
    groupId: string,
    customerIds: string[],
  ): Promise<Array<{ customerId: string; loanId: string }>> {
    const results: Array<{ customerId: string; loanId: string }> = [];
    for (const cId of customerIds) {
      const loan = await createLoan(clients.fieldOfficer, {
        customerId: cId,
        productVersionId: seedData.products.flatMonthly.versionId,
        overrides: { groupId },
        advanceTo: 'active',
        clients,
      });
      results.push({ customerId: cId, loanId: loan['id'] as string });
    }
    return results;
  }

  /**
   * Helper: get the first installment's total due for a loan.
   */
  async function getFirstInstallmentDue(loanId: string): Promise<number> {
    const schedules = await dbUtils.findSchedulesByLoanId(loanId);
    const first = schedules[0]!;
    return Number(first.principal_paise) + Number(first.interest_paise);
  }


  // ─── 11.1 Group Creation with Valid Data ──────────────────────────────

  describe('group creation with valid data persists group and members', () => {
    it('should create a group and persist it with leader as first member', async () => {
      const customerIds = await createCustomers(5);
      const leaderId = customerIds[0]!;

      const res = await clients.fieldOfficer.post('/groups').send({
        name: `E2E Test Group ${Date.now()}`,
        meetingDay: 'monday',
        branchArea: 'TestArea',
        leaderId,
      });

      expect(res.status).toBe(201);
      const groupId = res.body.id;
      expect(groupId).toBeDefined();

      // Verify group persisted in DB
      const group = await dbUtils.prisma.groups.findUnique({
        where: { id: groupId },
        include: {
          members: { where: { is_active: true } },
        },
      });
      expect(group).not.toBeNull();
      expect(group!.leader_id).toBe(leaderId);
      expect(group!.status).toBe('active');

      // Leader should be auto-added as first member
      expect(group!.members.length).toBe(1);
      expect(group!.members[0]!.customer_id).toBe(leaderId);
    });

    it('should persist all members when added to the group', async () => {
      const { groupId, customerIds } = await createGroupWithMembers(5);

      // Verify all members persisted
      const group = await dbUtils.prisma.groups.findUnique({
        where: { id: groupId },
        include: {
          members: { where: { is_active: true } },
        },
      });
      expect(group).not.toBeNull();
      expect(group!.members.length).toBe(5);

      const memberCustomerIds = group!.members.map((m) => m.customer_id).sort();
      const expectedIds = [...customerIds].sort();
      expect(memberCustomerIds).toEqual(expectedIds);
    });

    it('should return group details via GET /groups/:id', async () => {
      const { groupId } = await createGroupWithMembers(5);

      const res = await clients.fieldOfficer.get(`/groups/${groupId}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(groupId);
      expect(res.body.members.length).toBe(5);
      expect(res.body.leader).toBeDefined();
    });
  });

  // ─── 11.2 Group Size Constraints ──────────────────────────────────────

  describe('group size constraints: min 5, max 15 members', () => {
    it('should reject adding a member when group has reached max size (15)', async () => {
      const { groupId } = await createGroupWithMembers(15);

      // Try to add a 16th member
      const extraCustomer = await createCustomer(clients.fieldOfficer, {
        fullName: `Extra Member ${Date.now()}`,
      });

      const res = await clients.fieldOfficer
        .post(`/groups/${groupId}/members`)
        .send({ customerId: custId(extraCustomer) });

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('GROUP_MAX_SIZE_EXCEEDED');
    });

    it('should reject removing a member when group is at min size (5)', async () => {
      const { groupId } = await createGroupWithMembers(5);

      // Get the members
      const group = await dbUtils.prisma.groups.findUnique({
        where: { id: groupId },
        include: { members: { where: { is_active: true } } },
      });
      expect(group!.members.length).toBe(5);

      // Try to remove a non-leader member
      const memberToRemove = group!.members.find(
        (m) => m.customer_id !== group!.leader_id,
      )!;

      const res = await clients.fieldOfficer
        .delete(`/groups/${groupId}/members/${memberToRemove.id}`);

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('GROUP_MIN_SIZE_VIOLATED');
    });

    it('should allow adding members when group is below max size', async () => {
      const { groupId } = await createGroupWithMembers(5);

      const extraCustomer = await createCustomer(clients.fieldOfficer, {
        fullName: `Extra Member Below Max ${Date.now()}`,
      });

      const res = await clients.fieldOfficer
        .post(`/groups/${groupId}/members`)
        .send({ customerId: custId(extraCustomer) });

      expect(res.status).toBe(201);

      // Verify member count is now 6
      const count = await dbUtils.prisma.group_members.count({
        where: { group_id: groupId, is_active: true },
      });
      expect(count).toBe(6);
    });

    it('should allow removing a member when group is above min size', async () => {
      const { groupId } = await createGroupWithMembers(6);

      const group = await dbUtils.prisma.groups.findUnique({
        where: { id: groupId },
        include: { members: { where: { is_active: true } } },
      });

      // Remove a non-leader member
      const memberToRemove = group!.members.find(
        (m) => m.customer_id !== group!.leader_id,
      )!;

      const res = await clients.fieldOfficer
        .delete(`/groups/${groupId}/members/${memberToRemove.id}`);

      expect(res.status).toBe(200);

      // Verify member count is now 5
      const count = await dbUtils.prisma.group_members.count({
        where: { group_id: groupId, is_active: true },
      });
      expect(count).toBe(5);
    });
  });


  // ─── 11.3 Group Collection with Member-Wise Breakdown ─────────────────

  describe('group collection with member-wise breakdown validates sum equals total', () => {
    it('should post group collection when member amounts sum to total', async () => {
      const { groupId, customerIds } = await createGroupWithMembers(5);
      const loans = await createGroupLoans(groupId, customerIds);

      // Get first installment due for each loan
      const memberBreakdown: Array<{ loanId: string; amountPaise: number }> = [];
      let totalAmount = 0;

      for (const { loanId } of loans) {
        const due = await getFirstInstallmentDue(loanId);
        memberBreakdown.push({ loanId, amountPaise: due });
        totalAmount += due;
      }

      const key = idempKey('grp-coll');
      const res = await clients.collectionOfficer
        .post(`/groups/${groupId}/collections`)
        .send({
          totalAmountPaise: totalAmount,
          collectionDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: key,
          memberBreakdown,
        });

      expect(res.status).toBe(201);
      const data = res.body.data ?? res.body;
      expect(data.groupCollectionId).toBeDefined();
      expect(data.totalAmountPaise).toBe(totalAmount);
      expect(data.memberResults).toHaveLength(loans.length);

      // Verify each member's collection was allocated
      for (const result of data.memberResults) {
        expect(result.loanId).toBeDefined();
        expect(result.amountPaise).toBeGreaterThan(0);
        expect(result.collectionResult).toBeDefined();
      }
    });

    it('should allocate each member portion to their individual loan', async () => {
      const { groupId, customerIds } = await createGroupWithMembers(5);
      const loans = await createGroupLoans(groupId, customerIds);

      const memberBreakdown: Array<{ loanId: string; amountPaise: number }> = [];
      let totalAmount = 0;

      for (const { loanId } of loans) {
        const due = await getFirstInstallmentDue(loanId);
        memberBreakdown.push({ loanId, amountPaise: due });
        totalAmount += due;
      }

      const key = idempKey('grp-alloc');
      await clients.collectionOfficer
        .post(`/groups/${groupId}/collections`)
        .send({
          totalAmountPaise: totalAmount,
          collectionDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: key,
          memberBreakdown,
        });

      // Verify each loan had a collection posted and outstanding reduced
      for (const { loanId } of loans) {
        const due = await getFirstInstallmentDue(loanId);
        const collections = await dbUtils.findCollectionsByLoanId(loanId);
        expect(collections.length).toBeGreaterThanOrEqual(1);
        const totalCollected = collections.reduce(
          (sum, c) => sum + Number(c.amount_paise),
          0,
        );
        expect(totalCollected).toBeGreaterThanOrEqual(due);
      }
    });
  });

  // ─── 11.4 Mismatched Member Amounts Rejected ─────────────────────────

  describe('mismatched member amounts rejected with discrepancy error', () => {
    it('should reject when member breakdown sum is less than total', async () => {
      const { groupId, customerIds } = await createGroupWithMembers(5);
      const loans = await createGroupLoans(groupId, customerIds);

      const memberBreakdown: Array<{ loanId: string; amountPaise: number }> = [];
      let actualSum = 0;

      for (const { loanId } of loans) {
        const due = await getFirstInstallmentDue(loanId);
        memberBreakdown.push({ loanId, amountPaise: due });
        actualSum += due;
      }

      // Declare total higher than actual sum
      const inflatedTotal = actualSum + 1000;

      const res = await clients.collectionOfficer
        .post(`/groups/${groupId}/collections`)
        .send({
          totalAmountPaise: inflatedTotal,
          collectionDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: idempKey('mismatch-less'),
          memberBreakdown,
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('GROUP_COLLECTION_SUM_MISMATCH');
    });

    it('should reject when member breakdown sum exceeds total', async () => {
      const { groupId, customerIds } = await createGroupWithMembers(5);
      const loans = await createGroupLoans(groupId, customerIds);

      const memberBreakdown: Array<{ loanId: string; amountPaise: number }> = [];
      let actualSum = 0;

      for (const { loanId } of loans) {
        const due = await getFirstInstallmentDue(loanId);
        memberBreakdown.push({ loanId, amountPaise: due });
        actualSum += due;
      }

      // Declare total lower than actual sum
      const deflatedTotal = actualSum - 1000;

      const res = await clients.collectionOfficer
        .post(`/groups/${groupId}/collections`)
        .send({
          totalAmountPaise: deflatedTotal,
          collectionDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: idempKey('mismatch-more'),
          memberBreakdown,
        });

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('GROUP_COLLECTION_SUM_MISMATCH');
    });
  });


  // ─── 11.5 Group Collection Generates Individual Receipts ──────────────

  describe('group collection generates individual receipts per member', () => {
    it('should generate a receipt for each member in the group collection', async () => {
      const { groupId, customerIds } = await createGroupWithMembers(5);
      const loans = await createGroupLoans(groupId, customerIds);

      const memberBreakdown: Array<{ loanId: string; amountPaise: number }> = [];
      let totalAmount = 0;

      for (const { loanId } of loans) {
        const due = await getFirstInstallmentDue(loanId);
        memberBreakdown.push({ loanId, amountPaise: due });
        totalAmount += due;
      }

      const key = idempKey('grp-rcpt');
      const res = await clients.collectionOfficer
        .post(`/groups/${groupId}/collections`)
        .send({
          totalAmountPaise: totalAmount,
          collectionDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: key,
          memberBreakdown,
        });

      expect(res.status).toBe(201);

      // Verify individual receipts were generated for each member's loan
      for (const { loanId } of loans) {
        const collections = await dbUtils.findCollectionsByLoanId(loanId);
        expect(collections.length).toBeGreaterThanOrEqual(1);

        // Find the collection created by this group collection
        const latestCollection = collections[collections.length - 1]!;
        const receipt = await dbUtils.findReceiptByCollectionId(latestCollection.id);
        expect(receipt).not.toBeNull();
        expect(Number(receipt!.amount_paise)).toBeGreaterThan(0);
        expect(receipt!.receipt_number).toBeDefined();
      }

      // Verify total number of receipts matches member count
      const receiptNumbers = new Set<string>();
      for (const { loanId } of loans) {
        const collections = await dbUtils.findCollectionsByLoanId(loanId);
        const latestCollection = collections[collections.length - 1]!;
        const receipt = await dbUtils.findReceiptByCollectionId(latestCollection.id);
        if (receipt) receiptNumbers.add(receipt.receipt_number);
      }
      expect(receiptNumbers.size).toBe(loans.length);
    });

    it('should generate unique receipt numbers for each member receipt', async () => {
      const { groupId, customerIds } = await createGroupWithMembers(5);
      const loans = await createGroupLoans(groupId, customerIds);

      const memberBreakdown: Array<{ loanId: string; amountPaise: number }> = [];
      let totalAmount = 0;

      for (const { loanId } of loans) {
        const due = await getFirstInstallmentDue(loanId);
        memberBreakdown.push({ loanId, amountPaise: due });
        totalAmount += due;
      }

      const key = idempKey('grp-uniq-rcpt');
      await clients.collectionOfficer
        .post(`/groups/${groupId}/collections`)
        .send({
          totalAmountPaise: totalAmount,
          collectionDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: key,
          memberBreakdown,
        });

      // Collect all receipt numbers
      const receiptNumbers: string[] = [];
      for (const { loanId } of loans) {
        const collections = await dbUtils.findCollectionsByLoanId(loanId);
        const latestCollection = collections[collections.length - 1]!;
        const receipt = await dbUtils.findReceiptByCollectionId(latestCollection.id);
        if (receipt) receiptNumbers.push(receipt.receipt_number);
      }

      // All receipt numbers should be unique
      const uniqueNumbers = new Set(receiptNumbers);
      expect(uniqueNumbers.size).toBe(receiptNumbers.length);
      expect(receiptNumbers.length).toBe(loans.length);
    });
  });

  // ─── 11.6 Prevent Removing Member with Active Loans ───────────────────

  describe('prevent removing member with active loans', () => {
    it('should reject removal of a member who has active loans linked to the group', async () => {
      // Create a group with 6 members (above min so removal is otherwise allowed)
      const { groupId, customerIds } = await createGroupWithMembers(6);

      // Create an active loan for one member linked to this group
      const memberWithLoan = customerIds[1]!;
      await createLoan(clients.fieldOfficer, {
        customerId: memberWithLoan,
        productVersionId: seedData.products.flatMonthly.versionId,
        overrides: { groupId },
        advanceTo: 'active',
        clients,
      });

      // Find the member record for this customer
      const members = await dbUtils.prisma.group_members.findMany({
        where: { group_id: groupId, customer_id: memberWithLoan, is_active: true },
      });
      expect(members.length).toBe(1);
      const memberId = members[0]!.id;

      // Try to remove the member
      const res = await clients.fieldOfficer
        .delete(`/groups/${groupId}/members/${memberId}`);

      expect([400, 422]).toContain(res.status);
      expect(res.body.code).toBe('MEMBER_HAS_ACTIVE_LOANS');
    });

    it('should allow removal of a member without active loans when above min size', async () => {
      // Create a group with 6 members
      const { groupId, customerIds } = await createGroupWithMembers(6);

      // Don't create any loans — member has no active loans
      const memberWithoutLoan = customerIds[1]!;

      const members = await dbUtils.prisma.group_members.findMany({
        where: { group_id: groupId, customer_id: memberWithoutLoan, is_active: true },
      });
      expect(members.length).toBe(1);
      const memberId = members[0]!.id;

      const res = await clients.fieldOfficer
        .delete(`/groups/${groupId}/members/${memberId}`);

      expect(res.status).toBe(200);

      // Verify member is now inactive
      const updatedMember = await dbUtils.prisma.group_members.findUnique({
        where: { id: memberId },
      });
      expect(updatedMember!.is_active).toBe(false);
      expect(updatedMember!.left_at).not.toBeNull();
    });
  });
});
