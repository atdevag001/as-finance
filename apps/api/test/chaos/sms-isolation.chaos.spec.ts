/**
 * Chaos Test — SMS Failure Isolation
 *
 * Verifies that SMS provider failures do not affect finance transaction
 * completion (Property 9: SMS failure isolation).
 *
 * The outbox pattern means SMS notifications are enqueued within the same
 * transaction as the finance operation. The actual SMS dispatch happens
 * asynchronously when the outbox processor runs. Therefore, even if the
 * SMS provider is unreachable, the finance records are fully persisted
 * and an outbox message is enqueued for later retry.
 *
 * Pattern: Setup → Execute → Assert finance records → Assert outbox message
 *
 * Feature: expanded-test-automation, Property 9: SMS failure isolation
 * Validates: Requirements 13.1, 13.2, 13.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import supertest from 'supertest';
import { createCustomer, createLoan } from '../helpers/factories.js';
import {
  bootstrapChaosTest,
  chaosIdempKey as idempKey,
  extractCustomerId as custId,
  type ChaosTestContext,
} from './bootstrap.js';

// ─── Bootstrap ───────────────────────────────────────────────────────────────

let ctx: ChaosTestContext;

// ─── Test Suite ──────────────────────────────────────────────────────────────

describe('Chaos: SMS Failure Isolation', () => {
  beforeAll(() => {
    ctx = bootstrapChaosTest();
  });

  afterAll(async () => {
    await ctx.prisma.$disconnect();
  });

  /**
   * Helper: create a customer and loan, advance to 'active' status.
   */
  async function createActiveLoan() {
    const customer = await createCustomer(ctx.clients.fieldOfficer, {
      fullName: `Chaos SMS ${Date.now()}`,
    });
    const cId = custId(customer);
    const pvId = ctx.seedData.products.flatMonthly.versionId;

    const loan = await createLoan(ctx.clients.fieldOfficer, {
      customerId: cId,
      productVersionId: pvId,
      advanceTo: 'active',
      clients: ctx.clients,
    });

    return { customerId: cId, loanId: loan['id'] as string, loan };
  }

  /**
   * Helper: get the first installment's total due for a loan.
   */
  async function getFirstInstallmentDue(loanId: string): Promise<number> {
    const schedules = await ctx.dbUtils.findSchedulesByLoanId(loanId);
    const first = schedules[0]!;
    return Number(first.principal_paise) + Number(first.interest_paise);
  }

  // ─── Req 13.1: Collection finance records all persisted despite SMS failure ──

  it('should persist all collection finance records when SMS provider is unreachable (Property 9)', async () => {
    // Setup: create an active loan
    const { loanId } = await createActiveLoan();
    const emiDue = await getFirstInstallmentDue(loanId);

    // Capture pre-collection state
    const outstandingBefore = await ctx.dbUtils.getLoanOutstanding(loanId);
    const collectionsBefore = await ctx.dbUtils.findCollectionsByLoanId(loanId);
    const receiptCountBefore = await ctx.dbUtils.countReceiptsForLoan(loanId);

    const key = idempKey('sms-coll-finance');
    const res = await supertest(ctx.apiBaseUrl)
      .post('/collections')
      .set('Authorization', `Bearer ${ctx.seedData.users.collectionOfficer.token}`)
      .set('X-Request-ID', `chaos-sms-coll-${Date.now()}`)
      .send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

    // Collection should succeed — SMS failure isolation means finance ops complete
    expect(res.status).toBe(201);
    const data = res.body.data ?? res.body;

    // Verify collection record persisted
    expect(data.collectionId).toBeDefined();
    const collectionsAfter = await ctx.dbUtils.findCollectionsByLoanId(loanId);
    expect(collectionsAfter.length).toBe(collectionsBefore.length + 1);

    const newCollection = collectionsAfter.find(
      (c) => c.idempotency_key === key,
    );
    expect(newCollection).toBeDefined();
    expect(Number(newCollection!.amount_paise)).toBe(emiDue);

    // Verify allocation records persisted
    const allocations = await ctx.dbUtils.sumAllocationsForCollection(
      newCollection!.id,
    );
    const totalAllocated =
      Number(allocations.penalty) +
      Number(allocations.interest) +
      Number(allocations.principal);
    expect(totalAllocated).toBe(emiDue);

    // Verify journal entry persisted
    expect(data.journalEntryId).toBeDefined();
    const journalEntry = await ctx.dbUtils.findJournalEntryById(
      data.journalEntryId,
    );
    expect(journalEntry).not.toBeNull();

    // Verify journal lines balance (debits = credits)
    const journalLines = await ctx.dbUtils.findJournalLinesByEntryId(
      data.journalEntryId,
    );
    const totalDebits = journalLines.reduce(
      (sum, l) => sum + Number(l.debit_paise),
      0,
    );
    const totalCredits = journalLines.reduce(
      (sum, l) => sum + Number(l.credit_paise),
      0,
    );
    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(emiDue);

    // Verify receipt persisted
    const receiptCountAfter = await ctx.dbUtils.countReceiptsForLoan(loanId);
    expect(receiptCountAfter).toBe(receiptCountBefore + 1);

    const receipt = await ctx.dbUtils.findReceiptByCollectionId(newCollection!.id);
    expect(receipt).not.toBeNull();

    // Verify outstanding decreased correctly
    const outstandingAfter = await ctx.dbUtils.getLoanOutstanding(loanId);
    expect(outstandingAfter).toBe(outstandingBefore - BigInt(emiDue));
  });

  // ─── Req 13.2: Outbox message enqueued for later retry ──────────────

  it('should enqueue outbox message for SMS notification during collection (Property 9)', async () => {
    // Setup: create an active loan
    const { loanId } = await createActiveLoan();
    const emiDue = await getFirstInstallmentDue(loanId);

    // Post a collection
    const key = idempKey('sms-outbox');
    const res = await supertest(ctx.apiBaseUrl)
      .post('/collections')
      .set('Authorization', `Bearer ${ctx.seedData.users.collectionOfficer.token}`)
      .set('X-Request-ID', `chaos-sms-outbox-${Date.now()}`)
      .send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: key,
      });

    expect(res.status).toBe(201);
    const data = res.body.data ?? res.body;

    // Verify outbox message was enqueued for the collection
    const outboxMessages = await ctx.dbUtils.findOutboxMessagesBySource(
      'collection',
      data.collectionId,
    );
    expect(outboxMessages.length).toBeGreaterThanOrEqual(1);

    // Verify the outbox message has the correct event type
    const smsMessage = outboxMessages.find(
      (m) => m.event_type === 'collection_receipt',
    );
    expect(smsMessage).toBeDefined();

    // Verify the outbox message is in a pending/processable state
    expect(['pending', 'processing']).toContain(smsMessage!.status);

    // Verify the message contains the recipient mobile
    expect(smsMessage!.recipient_mobile).toBeDefined();
    expect(smsMessage!.recipient_mobile.length).toBeGreaterThan(0);

    // Verify the message body contains relevant info
    expect(smsMessage!.message_body).toBeDefined();
    expect(smsMessage!.message_body.length).toBeGreaterThan(0);
  });

  // ─── Req 13.3: Disbursement completes with loan status "active" ─────

  it('should complete disbursement with loan status "active" despite SMS provider being unreachable (Property 9)', async () => {
    // Setup: create a customer and loan, advance to 'approved' status
    const customer = await createCustomer(ctx.clients.fieldOfficer, {
      fullName: `Chaos SMS Disb ${Date.now()}`,
    });
    const cId = custId(customer);
    const pvId = ctx.seedData.products.flatMonthly.versionId;

    const loan = await createLoan(ctx.clients.fieldOfficer, {
      customerId: cId,
      productVersionId: pvId,
      advanceTo: 'approved',
      clients: ctx.clients,
    });
    const loanId = loan['id'] as string;

    // Disburse the loan
    const disbKey = idempKey('sms-disb');
    const res = await supertest(ctx.apiBaseUrl)
      .post('/disbursements')
      .set('Authorization', `Bearer ${ctx.seedData.users.manager.token}`)
      .set('X-Request-ID', `chaos-sms-disb-${Date.now()}`)
      .send({
        loanId,
        mode: 'cash',
        idempotencyKey: disbKey,
      });

    // Disbursement should succeed
    expect(res.status).toBe(201);
    const data = res.body.data ?? res.body;
    expect(data.disbursementId).toBeDefined();

    // Verify loan status is "active"
    const loanAfter = await ctx.dbUtils.findLoanById(loanId);
    expect(loanAfter).not.toBeNull();
    expect(loanAfter!.status).toBe('active');

    // Verify disbursement record persisted
    const disbursements = await ctx.prisma.disbursements.findMany({
      where: { loan_id: loanId },
    });
    expect(disbursements.length).toBe(1);
    expect(disbursements[0]!.idempotency_key).toBe(disbKey);

    // Verify journal entry for disbursement persisted
    expect(data.journalEntryId).toBeDefined();
    const journalEntry = await ctx.dbUtils.findJournalEntryById(
      data.journalEntryId,
    );
    expect(journalEntry).not.toBeNull();

    // Verify outbox message was enqueued for the disbursement notification
    const outboxMessages = await ctx.dbUtils.findOutboxMessagesBySource(
      'disbursement',
      disbursements[0]!.id,
    );
    expect(outboxMessages.length).toBeGreaterThanOrEqual(1);

    const smsMessage = outboxMessages.find(
      (m) => m.event_type === 'disbursed',
    );
    expect(smsMessage).toBeDefined();
    expect(['pending', 'processing']).toContain(smsMessage!.status);
  });
});
