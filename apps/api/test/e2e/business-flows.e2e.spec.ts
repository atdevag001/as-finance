import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection, createGroup } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Business Flows E2E Tests
 *
 * Complete end-to-end business flow scenarios spanning multiple modules.
 * Each flow exercises a realistic multi-step business process against
 * real infrastructure, verifying financial invariants at each step.
 *
 * Validates: Design GAP 9; Properties 4, 5, 6, 7, 15, 17, 24
 */

describe('Business Flows E2E', () => {
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
  function idempKey(prefix = 'e2e-bflow'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Helper: create a customer and loan, advance to 'active' status.
   */
  async function createActiveLoan(
    overrides?: { principalPaise?: number; tenureMonths?: number },
  ) {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `BizFlow Customer ${Date.now()}`,
    });
    const cId = custId(customer);

    const loan = await createLoan(clients.fieldOfficer, {
      customerId: cId,
      productVersionId: seedData.products.flatMonthly.versionId,
      overrides,
      advanceTo: 'active',
      clients,
    });

    return { customerId: cId, loanId: loan['id'] as string, loan };
  }


  // ═══════════════════════════════════════════════════════════════════════════
  // Flow 1: Happy Path — Full Loan Lifecycle
  // customer → loan → approve → disburse → pay all EMIs → outstanding=0 → close
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Flow 1: Happy path full loan lifecycle', () => {
    it('should complete the full lifecycle from customer creation to loan closure', async () => {
      // Step 1: Create customer
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: `Happy Path Customer ${Date.now()}`,
      });
      const customerId = custId(customer);
      expect(customerId).toBeDefined();

      // Step 2: Create loan in draft status
      const pvId = seedData.products.flatMonthly.versionId;
      const loanRes = await clients.fieldOfficer.post('/loans').send({
        customerId,
        productVersionId: pvId,
        principalPaise: 10_000_00,
        tenureMonths: 12,
        purpose: 'Happy path E2E test',
      });
      expect(loanRes.status).toBe(201);
      const loanId = loanRes.body.id as string;
      expect(loanRes.body.status).toBe('draft');

      // Step 3: Submit loan
      const submitRes = await clients.fieldOfficer.post(`/loans/${loanId}/submit`).send();
      expect(submitRes.status).toBe(200);

      // Step 4: Review loan
      const reviewRes = await clients.manager.post(`/loans/${loanId}/review`).send();
      expect(reviewRes.status).toBe(200);

      // Step 5: Approve loan (maker-checker: different user than creator)
      const approveRes = await clients.manager.post(`/loans/${loanId}/approve`).send({
        remarks: 'Happy path approval',
      });
      expect(approveRes.status).toBe(200);

      // Step 6: Disburse loan
      const disburseRes = await clients.manager.post('/disbursements').send({
        loanId,
        mode: 'cash',
        idempotencyKey: idempKey('disburse'),
      });
      expect(disburseRes.status).toBe(201);

      // Verify loan is now active
      const loanAfterDisburse = await dbUtils.findLoanById(loanId);
      expect(loanAfterDisburse!.status).toBe('active');
      expect(Number(loanAfterDisburse!.cached_outstanding_paise)).toBeGreaterThan(0);

      // Step 7: Pay all EMIs sequentially
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      expect(schedules.length).toBe(12);

      for (const inst of schedules) {
        const due = Number(inst.principal_paise) + Number(inst.interest_paise);
        await postCollection(clients.collectionOfficer, {
          loanId,
          amountPaise: due,
          overrides: { paymentDate: '2024-01-15' },
        });
      }

      // Step 8: Verify outstanding = 0
      const loanAfterPayments = await dbUtils.findLoanById(loanId);
      expect(Math.abs(Number(loanAfterPayments!.cached_outstanding_paise))).toBeLessThanOrEqual(1);

      // Step 9: Close the loan
      const closeRes = await clients.manager.post(`/loans/${loanId}/close`);
      expect(closeRes.status).toBe(200);

      // Step 10: Verify final state
      const finalLoan = await dbUtils.findLoanById(loanId);
      expect(finalLoan!.status).toBe('closed');
      expect(Math.abs(Number(finalLoan!.cached_outstanding_paise))).toBeLessThanOrEqual(1);

      // Verify all installments are paid
      const finalSchedules = await dbUtils.findSchedulesByLoanId(loanId);
      for (const inst of finalSchedules) {
        expect(inst.status).toBe('paid');
      }

      // Verify receipts were generated for each payment
      const receiptCount = await dbUtils.countReceiptsForLoan(loanId);
      expect(receiptCount).toBe(12);

      // Verify audit trail exists for the full lifecycle
      const auditLogs = await dbUtils.findAuditLogsByTarget('loan', loanId);
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const closureLog = auditLogs.find(
        (log) => String(log.action_type) === 'loan_closed',
      );
      expect(closureLog).toBeDefined();
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // Flow 2: Partial Payment → Overdue → Penalty → Collection → Active
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Flow 2: Partial payment → overdue → penalty → collection → status returns to active', () => {
    it('should handle partial payment, overdue transition, penalty, and recovery to active', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const firstInst = schedules[0]!;
      const emiDue = Number(firstInst.principal_paise) + Number(firstInst.interest_paise);

      // Step 1: Pay partial first EMI (half the due amount)
      const partialAmount = Math.floor(emiDue / 2);
      await postCollection(clients.collectionOfficer, {
        loanId,
        amountPaise: partialAmount,
        overrides: { paymentDate: '2024-01-15' },
      });

      // Verify installment is partial
      const schedulesAfterPartial = await dbUtils.findSchedulesByLoanId(loanId);
      expect(schedulesAfterPartial[0]!.status).toBe('partial');

      // Step 2: Post penalty to trigger overdue status
      const refDate = new Date(firstInst.due_date);
      refDate.setDate(refDate.getDate() + 30);

      const penaltyRes = await clients.manager.post('/penalties/calculate').send({
        loanId,
        installmentId: firstInst.id,
        penaltyPeriod: `flow2-${Date.now()}`,
        referenceDate: refDate.toISOString(),
      });
      expect(penaltyRes.status).toBe(201);
      const penaltyData = penaltyRes.body.data ?? penaltyRes.body;
      const penaltyAmount = Number(penaltyData.penalty.amount_paise);
      expect(penaltyAmount).toBeGreaterThan(0);

      // Verify loan is now overdue
      const loanOverdue = await dbUtils.findLoanById(loanId);
      expect(loanOverdue!.status).toBe('overdue');
      expect(loanOverdue!.dpd).toBeGreaterThan(0);

      // Step 3: Pay the full outstanding to recover
      const outstanding = Number(loanOverdue!.cached_outstanding_paise);
      await postCollection(clients.collectionOfficer, {
        loanId,
        amountPaise: outstanding,
        overrides: { paymentDate: new Date().toISOString().split('T')[0] },
      });

      // Step 4: Verify loan returns to active (or closed if fully paid)
      const loanRecovered = await dbUtils.findLoanById(loanId);
      expect(['active', 'closed']).toContain(loanRecovered!.status);
      expect(loanRecovered!.dpd).toBe(0);
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // Flow 3: Group Lending
  // 5 customers → group → individual loans → group collection → individual receipts
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Flow 3: Group lending (5 customers → group → individual loans → group collection → individual receipts)', () => {
    it('should create a group, issue individual loans, collect via group, and generate individual receipts', async () => {
      // Step 1: Create 5 customers
      const customerIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const customer = await createCustomer(clients.fieldOfficer, {
          fullName: `Group Flow Customer ${Date.now()}-${i}`,
        });
        customerIds.push(custId(customer));
      }

      // Step 2: Create group with first customer as leader
      const group = await createGroup(clients.fieldOfficer, {
        leaderId: customerIds[0]!,
      });
      const groupId = group['id'] as string;

      // Add remaining members
      for (let i = 1; i < customerIds.length; i++) {
        const addRes = await clients.fieldOfficer
          .post(`/groups/${groupId}/members`)
          .send({ customerId: customerIds[i] });
        expect(addRes.status).toBe(201);
      }

      // Step 3: Create individual active loans for each member linked to the group
      const loans: Array<{ customerId: string; loanId: string }> = [];
      for (const cId of customerIds) {
        const loan = await createLoan(clients.fieldOfficer, {
          customerId: cId,
          productVersionId: seedData.products.flatMonthly.versionId,
          overrides: { groupId },
          advanceTo: 'active',
          clients,
        });
        loans.push({ customerId: cId, loanId: loan['id'] as string });
      }

      // Step 4: Build member-wise breakdown for group collection
      const memberBreakdown: Array<{ loanId: string; amountPaise: number }> = [];
      let totalAmount = 0;

      for (const { loanId } of loans) {
        const schedules = await dbUtils.findSchedulesByLoanId(loanId);
        const firstInst = schedules[0]!;
        const due = Number(firstInst.principal_paise) + Number(firstInst.interest_paise);
        memberBreakdown.push({ loanId, amountPaise: due });
        totalAmount += due;
      }

      // Step 5: Post group collection
      const groupCollRes = await clients.collectionOfficer
        .post(`/groups/${groupId}/collections`)
        .send({
          totalAmountPaise: totalAmount,
          collectionDate: '2024-01-15',
          paymentMode: 'cash',
          idempotencyKey: idempKey('grp-flow'),
          memberBreakdown,
        });

      expect(groupCollRes.status).toBe(201);
      const groupCollData = groupCollRes.body.data ?? groupCollRes.body;
      expect(groupCollData.memberResults).toHaveLength(5);

      // Step 6: Verify individual receipts for each member
      const receiptNumbers = new Set<string>();
      for (const { loanId } of loans) {
        const collections = await dbUtils.findCollectionsByLoanId(loanId);
        expect(collections.length).toBeGreaterThanOrEqual(1);

        const latestColl = collections[collections.length - 1]!;
        const receipt = await dbUtils.findReceiptByCollectionId(latestColl.id);
        expect(receipt).not.toBeNull();
        expect(receipt!.receipt_number).toBeDefined();
        receiptNumbers.add(receipt!.receipt_number);
      }

      // All receipt numbers should be unique
      expect(receiptNumbers.size).toBe(5);

      // Step 7: Verify individual loan outstanding updates
      for (const { loanId } of loans) {
        const schedules = await dbUtils.findSchedulesByLoanId(loanId);
        const firstInst = schedules[0]!;
        expect(firstInst.status).toBe('paid');
      }
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // Flow 4: Reversal + Re-collection
  // post → verify → reverse → verify compensating → re-post → verify
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Flow 4: Reversal + re-collection (post → verify → reverse → verify compensating → re-post → verify)', () => {
    it('should post, reverse, and re-collect with correct ledger and outstanding at each step', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const firstInst = schedules[0]!;
      const emiDue = Number(firstInst.principal_paise) + Number(firstInst.interest_paise);

      // Capture initial outstanding
      const loanInitial = await dbUtils.findLoanById(loanId);
      const initialOutstanding = Number(loanInitial!.cached_outstanding_paise);

      // Step 1: Post collection
      const collKey = idempKey('rev-flow-coll');
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: collKey,
      });
      expect(collRes.status).toBe(201);
      const collData = collRes.body.data ?? collRes.body;
      const collectionId = collData.collectionId as string;

      // Step 2: Verify collection — outstanding reduced, receipt exists
      const loanAfterColl = await dbUtils.findLoanById(loanId);
      const outstandingAfterColl = Number(loanAfterColl!.cached_outstanding_paise);
      expect(outstandingAfterColl).toBe(initialOutstanding - emiDue);

      const receipt = await dbUtils.findReceiptByCollectionId(collectionId);
      expect(receipt).not.toBeNull();
      expect(receipt!.status).toBe('active');

      // Get original journal entry for later verification
      const collRecord = (await dbUtils.findCollectionsByLoanId(loanId)).find(
        (c) => c.id === collectionId,
      )!;
      const originalJournalId = collRecord.journal_entry_id;

      // Step 3: Reverse the collection
      const revKey = idempKey('rev-flow-rev');
      const revRes = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'Business flow reversal test',
        idempotencyKey: revKey,
      });
      expect(revRes.status).toBe(201);
      const revData = revRes.body.data ?? revRes.body;

      // Step 4: Verify compensating entries
      // Outstanding restored to initial
      const loanAfterRev = await dbUtils.findLoanById(loanId);
      expect(Number(loanAfterRev!.cached_outstanding_paise)).toBe(initialOutstanding);

      // Original receipt marked as reversed
      const receiptAfterRev = await dbUtils.findReceiptByCollectionId(collectionId);
      expect(receiptAfterRev!.status).toBe('reversed');

      // Compensating receipt issued
      const compensatingReceipt = await dbUtils.findReceiptByCollectionId(
        revData.reversalCollectionId,
      );
      expect(compensatingReceipt).not.toBeNull();

      // Net ledger effect = zero per account
      const originalLines = await dbUtils.findJournalLinesByEntryId(originalJournalId);
      const mirrorLines = await dbUtils.findJournalLinesByEntryId(
        revData.mirrorJournalEntryId,
      );
      const accountNetMap = new Map<string, number>();
      for (const line of [...originalLines, ...mirrorLines]) {
        const current = accountNetMap.get(line.account_id) ?? 0;
        accountNetMap.set(
          line.account_id,
          current + Number(line.debit_paise) - Number(line.credit_paise),
        );
      }
      for (const [, netAmount] of accountNetMap) {
        expect(netAmount).toBe(0);
      }

      // First installment back to pending
      const schedulesAfterRev = await dbUtils.findSchedulesByLoanId(loanId);
      expect(schedulesAfterRev[0]!.status).toBe('pending');

      // Step 5: Re-post the collection
      const reCollKey = idempKey('rev-flow-recoll');
      const reCollRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: reCollKey,
      });
      expect(reCollRes.status).toBe(201);
      const reCollData = reCollRes.body.data ?? reCollRes.body;

      // Step 6: Verify re-collection
      const loanAfterReColl = await dbUtils.findLoanById(loanId);
      expect(Number(loanAfterReColl!.cached_outstanding_paise)).toBe(
        initialOutstanding - emiDue,
      );

      // New receipt generated
      const newReceipt = await dbUtils.findReceiptByCollectionId(
        reCollData.collectionId,
      );
      expect(newReceipt).not.toBeNull();
      expect(newReceipt!.status).toBe('active');

      // First installment paid again
      const schedulesAfterReColl = await dbUtils.findSchedulesByLoanId(loanId);
      expect(schedulesAfterReColl[0]!.status).toBe('paid');
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // Flow 5: Foreclosure
  // 3 EMIs paid → quote → approve → settle → status=foreclosed → verify ledger
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Flow 5: Foreclosure (3 EMIs paid → quote → approve → settle → status=foreclosed → verify ledger)', () => {
    it('should complete foreclosure after partial repayment with correct ledger entries', async () => {
      // Step 1: Create active loan and pay 3 EMIs
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);

      for (let i = 0; i < 3 && i < schedules.length; i++) {
        const inst = schedules[i]!;
        const due = Number(inst.principal_paise) + Number(inst.interest_paise);
        await postCollection(clients.collectionOfficer, {
          loanId,
          amountPaise: due,
          overrides: { paymentDate: '2024-01-15' },
        });
      }

      // Verify 3 installments paid
      const schedulesAfterPayments = await dbUtils.findSchedulesByLoanId(loanId);
      for (let i = 0; i < 3; i++) {
        expect(schedulesAfterPayments[i]!.status).toBe('paid');
      }

      // Capture outstanding before foreclosure
      const loanBeforeFC = await dbUtils.findLoanById(loanId);
      const outstandingBeforeFC = Number(loanBeforeFC!.cached_outstanding_paise);
      expect(outstandingBeforeFC).toBeGreaterThan(0);

      // Step 2: Request foreclosure quote (manager is requester)
      const quoteRes = await clients.manager.post('/foreclosures/quote').send({
        loanId,
      });
      expect(quoteRes.status).toBe(201);
      const foreclosureId = quoteRes.body.foreclosureId;
      const settlementAmount = quoteRes.body.settlementAmountPaise;
      expect(settlementAmount).toBeGreaterThan(0);

      // Verify quote components
      expect(quoteRes.body.outstandingPrincipalPaise).toBeGreaterThan(0);
      expect(quoteRes.body.accruedInterestPaise).toBeGreaterThanOrEqual(0);
      expect(quoteRes.body.status).toBe('quote');

      // Step 3: Approve and settle (manager2 for maker-checker)
      const settleRes = await clients.manager2.post('/foreclosures').send({
        foreclosureId,
        paymentMode: 'cash',
        idempotencyKey: idempKey('fc-settle'),
      });
      expect(settleRes.status).toBe(201);
      const settleData = settleRes.body.data ?? settleRes.body;
      expect(settleData.status).toBe('settled');

      // Step 4: Verify loan status = foreclosed
      const loanAfterFC = await dbUtils.findLoanById(loanId);
      expect(loanAfterFC!.status).toBe('foreclosed');
      expect(Number(loanAfterFC!.cached_outstanding_paise)).toBe(0);

      // Step 5: Verify all installments closed
      const finalSchedules = await dbUtils.findSchedulesByLoanId(loanId);
      for (const inst of finalSchedules) {
        expect(['paid', 'closed']).toContain(inst.status);
      }

      // Step 6: Verify ledger — settlement journal entry is balanced
      const journalLines = await dbUtils.findJournalLinesByEntryId(
        settleData.journalEntryId,
      );
      expect(journalLines.length).toBeGreaterThanOrEqual(2);
      const totalDebits = journalLines.reduce(
        (s, l) => s + Number(l.debit_paise),
        0,
      );
      const totalCredits = journalLines.reduce(
        (s, l) => s + Number(l.credit_paise),
        0,
      );
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(settlementAmount);

      // Verify audit trail
      const auditLogs = await dbUtils.findAuditLogsByTarget('loan', loanId);
      const fcLog = auditLogs.find(
        (log) => String(log.action_type) === 'loan_foreclosed',
      );
      expect(fcLog).toBeDefined();
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // Flow 6: Customer Blacklist → Reinstatement
  // blacklist → loan rejected → reinstate → loan accepted → audit trail
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Flow 6: Customer blacklist → reinstatement (blacklist → loan rejected → reinstate → loan accepted → audit trail)', () => {
    it('should blacklist customer, reject loan, reinstate, accept loan, and maintain audit trail', async () => {
      const pvId = seedData.products.flatMonthly.versionId;

      // Step 1: Create customer
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: `Blacklist Flow Customer ${Date.now()}`,
      });
      const customerId = custId(customer);

      // Step 2: Blacklist the customer
      const blacklistRes = await clients.manager
        .post(`/customers/${customerId}/blacklist`)
        .send({ reason: 'Business flow blacklist test' });
      expect(blacklistRes.status).toBe(200);
      expect(blacklistRes.body.status).toBe('blacklisted');

      // Verify DB state
      const dbCustomerBlacklisted = await dbUtils.findCustomerById(customerId);
      expect(dbCustomerBlacklisted!.status).toBe('blacklisted');
      expect(dbCustomerBlacklisted!.blacklist_reason).toBe('Business flow blacklist test');

      // Step 3: Attempt loan creation — should be rejected
      const rejectedLoanRes = await clients.fieldOfficer.post('/loans').send({
        customerId,
        productVersionId: pvId,
        principalPaise: 10_000_00,
        tenureMonths: 12,
        purpose: 'Loan for blacklisted customer',
      });
      expect(rejectedLoanRes.status).toBe(422);
      expect(rejectedLoanRes.body.code).toBe('CUSTOMER_BLACKLISTED');

      // Step 4: Reinstate the customer
      const reinstateRes = await clients.manager
        .post(`/customers/${customerId}/reinstate`)
        .send({ reason: 'Cleared after review — business flow test' });
      expect(reinstateRes.status).toBe(200);

      // Verify DB state after reinstatement
      const dbCustomerReinstated = await dbUtils.findCustomerById(customerId);
      expect(dbCustomerReinstated!.status).toBe('active');

      // Step 5: Loan creation should now succeed
      const acceptedLoanRes = await clients.fieldOfficer.post('/loans').send({
        customerId,
        productVersionId: pvId,
        principalPaise: 10_000_00,
        tenureMonths: 12,
        purpose: 'Loan after reinstatement',
      });
      expect(acceptedLoanRes.status).toBe(201);
      expect(acceptedLoanRes.body.id).toBeDefined();
      expect(acceptedLoanRes.body.status).toBe('draft');

      // Step 6: Verify audit trail for both blacklist and reinstatement
      const auditLogs = await dbUtils.findAuditLogsByTarget('customer', customerId);

      const blacklistLog = auditLogs.find(
        (log) => String(log.action_type) === 'customer_blacklisted',
      );
      expect(blacklistLog).toBeDefined();
      expect(blacklistLog!.actor_id).toBeDefined();
      expect(blacklistLog!.remarks).toBe('Business flow blacklist test');

      const reinstateLog = auditLogs.find(
        (log) => String(log.action_type) === 'customer_reinstated',
      );
      expect(reinstateLog).toBeDefined();
      expect(reinstateLog!.actor_id).toBeDefined();
      expect(reinstateLog!.remarks).toBe('Cleared after review — business flow test');

      // Reinstatement should come after blacklist chronologically
      expect(
        new Date(reinstateLog!.created_at).getTime(),
      ).toBeGreaterThanOrEqual(
        new Date(blacklistLog!.created_at).getTime(),
      );
    });
  });


  // ═══════════════════════════════════════════════════════════════════════════
  // Flow 7: Advance Payment
  // pay 3x EMI → verify first 3 installments paid → verify future allocation → verify outstanding
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Flow 7: Advance payment (pay 3x EMI → verify first 3 installments paid → verify future allocation → verify outstanding)', () => {
    it('should allocate advance payment across multiple future installments in chronological order', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      expect(schedules.length).toBeGreaterThanOrEqual(3);

      // Calculate 3x EMI amount
      const firstEmi = Number(schedules[0]!.principal_paise) + Number(schedules[0]!.interest_paise);
      const secondEmi = Number(schedules[1]!.principal_paise) + Number(schedules[1]!.interest_paise);
      const thirdEmi = Number(schedules[2]!.principal_paise) + Number(schedules[2]!.interest_paise);
      const advanceAmount = firstEmi + secondEmi + thirdEmi;

      // Capture outstanding before payment
      const loanBefore = await dbUtils.findLoanById(loanId);
      const outstandingBefore = Number(loanBefore!.cached_outstanding_paise);

      // Step 1: Pay 3x EMI in a single collection
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: advanceAmount,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: idempKey('advance-pay'),
      });
      expect(collRes.status).toBe(201);

      // Step 2: Verify first 3 installments are fully paid
      const schedulesAfter = await dbUtils.findSchedulesByLoanId(loanId);
      for (let i = 0; i < 3; i++) {
        const inst = schedulesAfter[i]!;
        expect(inst.status).toBe('paid');
        expect(Number(inst.principal_paid_paise)).toBe(Number(inst.principal_paise));
        expect(Number(inst.interest_paid_paise)).toBe(Number(inst.interest_paise));
      }

      // Step 3: Verify future installments (4th onwards) are still pending
      for (let i = 3; i < schedulesAfter.length; i++) {
        expect(schedulesAfter[i]!.status).toBe('pending');
      }

      // Step 4: Verify outstanding reduced by the full advance amount
      const loanAfter = await dbUtils.findLoanById(loanId);
      const outstandingAfter = Number(loanAfter!.cached_outstanding_paise);
      expect(outstandingAfter).toBe(outstandingBefore - advanceAmount);

      // Step 5: Verify allocation preservation — sum of allocated = advance amount
      const collections = await dbUtils.findCollectionsByLoanId(loanId);
      const advanceColl = collections[collections.length - 1]!;
      const allocations = await dbUtils.sumAllocationsForCollection(advanceColl.id);
      const totalAllocated =
        Number(allocations.penalty) +
        Number(allocations.interest) +
        Number(allocations.principal);
      expect(totalAllocated).toBe(advanceAmount);

      // Step 6: Verify receipt generated
      const receipt = await dbUtils.findReceiptByCollectionId(advanceColl.id);
      expect(receipt).not.toBeNull();
      expect(Number(receipt!.amount_paise)).toBe(advanceAmount);
    });
  });
});
