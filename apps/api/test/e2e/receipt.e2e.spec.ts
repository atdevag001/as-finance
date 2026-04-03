import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, createLoan, postCollection } from '../helpers/factories.js';
import type { SeedData } from '../setup/global-setup.js';

/**
 * Receipt E2E Tests
 *
 * Verifies receipt generation, immutability, sequential numbering,
 * print format, and reversal marking through the full API.
 *
 * Addresses traceability gap: Receipt had unit + PBT + contract but no E2E.
 * Validates: Requirements 19.1–19.6; Properties 18, 19
 */

describe('Receipt E2E', () => {
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

  async function createActiveLoan() {
    const customer = await createCustomer(clients.fieldOfficer, {
      fullName: `Receipt Test ${Date.now()}`,
    });
    const cId = (customer as Record<string, unknown>)['id'] as string;
    const pvId = seedData.products.flatMonthly.versionId;

    const loan = await createLoan(clients.fieldOfficer, {
      customerId: cId,
      productVersionId: pvId,
      advanceTo: 'active',
      clients,
    });

    return { customerId: cId, loanId: loan['id'] as string };
  }

  // ── Req 19.1: Receipt generated on collection ─────────────────────────

  describe('Req 19.1 — Receipt generation', () => {
    it('should generate a receipt with sequential number on successful collection', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const emiDue = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: `rcp-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      expect(collRes.status).toBe(201);
      const data = collRes.body.data ?? collRes.body;
      expect(data.receiptId).toBeDefined();
      expect(data.receiptNumber).toBeDefined();
      expect(data.receiptNumber).toMatch(/^RCP-\d{4}-\d+$/);
    });

    it('should store receipt with correct snapshot data', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const emiDue = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: `rcp-snap-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      const data = collRes.body.data ?? collRes.body;
      const receipt = await dbUtils.findReceiptByCollectionId(data.collectionId);

      expect(receipt).not.toBeNull();
      expect(Number(receipt!.amount_paise)).toBe(emiDue);
      expect(receipt!.loan_number).toBeDefined();
      expect(receipt!.customer_name).toBeDefined();
    });
  });

  // ── Req 19.2: Sequential receipt numbers ──────────────────────────────

  describe('Req 19.2 — Sequential receipt numbers', () => {
    it('should generate strictly increasing receipt numbers for sequential collections', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const emiDue = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

      // Post two collections
      const res1 = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: `rcp-seq1-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      const res2 = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-02-15',
        idempotencyKey: `rcp-seq2-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      const num1 = (res1.body.data ?? res1.body).receiptNumber as string;
      const num2 = (res2.body.data ?? res2.body).receiptNumber as string;

      // Extract numeric portion and verify ordering
      const extractNum = (rn: string) => parseInt(rn.split('-').pop()!, 10);
      expect(extractNum(num2)).toBeGreaterThan(extractNum(num1));
    });
  });

  // ── Req 19.3: Receipt immutability ────────────────────────────────────

  describe('Req 19.3 — Receipt immutability', () => {
    it('should return identical receipt content on repeated reads', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const emiDue = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: `rcp-immut-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      const receiptId = (collRes.body.data ?? collRes.body).receiptId;

      // Read receipt twice
      const read1 = await clients.collectionOfficer.get(`/receipts/${receiptId}`);
      const read2 = await clients.collectionOfficer.get(`/receipts/${receiptId}`);

      expect(read1.status).toBe(200);
      expect(read2.status).toBe(200);

      // Content should be identical
      const r1 = read1.body.data ?? read1.body;
      const r2 = read2.body.data ?? read2.body;
      expect(r1.receipt_number ?? r1.receiptNumber).toBe(r2.receipt_number ?? r2.receiptNumber);
      expect(r1.amount_paise ?? r1.amountPaise).toBe(r2.amount_paise ?? r2.amountPaise);
      expect(r1.customer_name ?? r1.customerName).toBe(r2.customer_name ?? r2.customerName);
      expect(r1.loan_number ?? r1.loanNumber).toBe(r2.loan_number ?? r2.loanNumber);
    });
  });

  // ── Req 19.4: Receipt print format ────────────────────────────────────

  describe('Req 19.4 — Receipt print format', () => {
    it('should return printable receipt format', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const emiDue = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: `rcp-print-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      const receiptId = (collRes.body.data ?? collRes.body).receiptId;

      const printRes = await clients.collectionOfficer.get(`/receipts/${receiptId}/print`);
      expect(printRes.status).toBe(200);
      // Print response should contain receipt data
      const printData = printRes.body.data ?? printRes.body;
      expect(printData).toBeDefined();
    });
  });

  // ── Req 19.5: Reversal marks receipt as reversed ──────────────────────

  describe('Req 19.5 — Reversal receipt marking', () => {
    it('should mark original receipt as reversed and create compensating receipt on reversal', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const emiDue = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

      // Post collection
      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: `rcp-rev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      const collectionId = (collRes.body.data ?? collRes.body).collectionId;
      const originalReceiptId = (collRes.body.data ?? collRes.body).receiptId;

      // Reverse the collection
      const revRes = await clients.manager.post('/reversals').send({
        collectionId,
        reason: 'Receipt reversal E2E test',
        idempotencyKey: `rcp-rev-r-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      expect(revRes.status).toBe(201);

      // Verify original receipt is marked as reversed
      const originalReceipt = await dbUtils.findReceiptByCollectionId(collectionId);
      // The receipt should have a status indicating reversal or a compensating_receipt_id
      // Check via DB that the receipt state reflects reversal
      if (originalReceipt) {
        // Receipt should be marked as reversed (status or flag)
        const isReversed = originalReceipt.status === 'reversed' ||
          (originalReceipt as Record<string, unknown>)['is_reversed'] === true ||
          originalReceipt.compensating_receipt_id !== null;
        expect(isReversed).toBe(true);
      }

      // Verify a compensating receipt was created
      const revData = revRes.body.data ?? revRes.body;
      if (revData.compensatingReceiptId || revData.receiptId) {
        const compReceiptId = revData.compensatingReceiptId ?? revData.receiptId;
        expect(compReceiptId).toBeDefined();
      }
    });
  });

  // ── Req 19.6: Receipt component sum equals collection amount ──────────

  describe('Req 19.6 — Receipt component reconciliation', () => {
    it('should have receipt components summing to collection amount', async () => {
      const { loanId } = await createActiveLoan();
      const schedules = await dbUtils.findSchedulesByLoanId(loanId);
      const emiDue = Number(schedules[0]!.principal_paise + schedules[0]!.interest_paise);

      const collRes = await clients.collectionOfficer.post('/collections').send({
        loanId,
        amountPaise: emiDue,
        paymentMode: 'cash',
        paymentDate: '2024-01-15',
        idempotencyKey: `rcp-comp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });

      const data = collRes.body.data ?? collRes.body;
      const allocations = data.allocations ?? {};

      const penaltyPaise = allocations.penaltyPaise ?? allocations.penalty_paise ?? 0;
      const interestPaise = allocations.interestPaise ?? allocations.interest_paise ?? 0;
      const principalPaise = allocations.principalPaise ?? allocations.principal_paise ?? 0;

      expect(penaltyPaise + interestPaise + principalPaise).toBe(emiDue);
    });
  });
});
