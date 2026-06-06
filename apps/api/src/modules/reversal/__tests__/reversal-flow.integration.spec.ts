import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../../common/errors';
import { ReversalService } from '../reversal.service';

/**
 * Integration tests for reversal flow.
 * Tests: collection reversal → compensating entries → schedule rollback → ledger mirror.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4
 */

// ── Mock Factories ───────────────────────────────────────────────────────────

function createMockTx() {
  return {
    collections: {
      findUnique: vi.fn(),
      create: vi.fn().mockResolvedValue({
        id: 'rev-col-1', loan_id: 'loan-1',
        amount_paise: -50000n, payment_date: new Date(),
      }),
      update: vi.fn().mockResolvedValue({}),
    },
    collection_allocations: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'alloc-1', installment_id: 's-1', penalty_id: null,
          penalty_paise: 0n, interest_paise: 10000n,
          principal_paise: 40000n, total_paise: 50000n,
        },
      ]),
      create: vi.fn().mockResolvedValue({}),
    },
    // H4: reversal decrements paid_paise on the exact penalty row referenced
    // by collection_allocations.penalty_id (or walks oldest-first when NULL).
    penalties: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    journal_entries: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'je-1',
        lines: [
          { account_id: 'acc-cash', debit_paise: 50000n, credit_paise: 0n },
          { account_id: 'acc-lr', debit_paise: 0n, credit_paise: 40000n },
          { account_id: 'acc-int', debit_paise: 0n, credit_paise: 10000n },
        ],
      }),
    },
    receipts: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'rcp-1', amount_paise: 50000n, payment_mode: 'cash' },
      ]),
    },
    // Reversal re-locks the original collection mid-tx — default to still-posted.
    $queryRaw: vi.fn().mockResolvedValue([
      { id: 'col-1', status: 'posted', is_reversal: false },
    ]),
  };
}

function createMockDeps() {
  const tx = createMockTx();
  return {
    tx,
    prisma: {
      $transaction: vi.fn((fn: (t: unknown) => Promise<unknown>) => fn(tx)),
    },
    collectionRepo: {
      lockLoanForUpdate: vi.fn().mockResolvedValue({
        id: 'loan-1', status: 'active', cached_outstanding_paise: 500000n,
      }),
      getLoanForCollection: vi.fn().mockResolvedValue({
        id: 'loan-1', loan_number: 'LN-2024-00001', customer_id: 'cust-1',
        status: 'active', cached_outstanding_paise: 500000n, dpd: 0,
        customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
        schedules: [
          {
            id: 's-1', due_date: new Date('2024-01-15'),
            principal_paise: 500000n, interest_paise: 50000n,
            principal_paid_paise: 40000n, interest_paid_paise: 10000n,
            penalty_paid_paise: 0n,
          },
        ],
      }),
      updateInstallment: vi.fn().mockResolvedValue(undefined),
      updateLoanOutstanding: vi.fn().mockResolvedValue(undefined),
      getOfficerName: vi.fn().mockResolvedValue('Officer Name'),
      // M15: reversal recomputes cached_outstanding from schedule + pending penalties.
      getPendingPenalties: vi.fn().mockResolvedValue([]),
    },
    accounting: {
      createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-mirror-1' }),
    },
    audit: { createAuditLog: vi.fn().mockResolvedValue({}) },
    idempotency: {
      find: vi.fn().mockResolvedValue(null),
      store: vi.fn().mockResolvedValue({}),
    },
    receipt: {
      generateReceipt: vi.fn().mockResolvedValue({
        id: 'rcp-rev-1', receipt_number: 'RCP-2024-00002',
      }),
      markAsReversed: vi.fn().mockResolvedValue(undefined),
    },
  };
}

function buildOriginalCollection(overrides: Record<string, unknown> = {}) {
  return {
    id: 'col-1', loan_id: 'loan-1', amount_paise: 50000n,
    payment_date: new Date('2024-01-15'), payment_mode: 'cash',
    status: 'posted', is_reversal: false, journal_entry_id: 'je-1',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Reversal Flow Integration', () => {
  let service: ReversalService;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    deps = createMockDeps();
    deps.tx.collections.findUnique.mockResolvedValue(buildOriginalCollection());

    service = new ReversalService(
      deps.prisma as never, deps.collectionRepo as never,
      deps.accounting as never, deps.audit as never,
      deps.idempotency as never, deps.receipt as never,
    );
  });

  // ── Requirement 9.1: Full reversal flow ────────────────────────────────

  describe('Req 9.1 — Full reversal flow verification', () => {
    it('should create compensating collection with negative amount and is_reversal=true', async () => {
      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Incorrect amount', idempotencyKey: 'rev-key-1' },
        'manager-1', 'manager',
      );

      expect(deps.tx.collections.create).toHaveBeenCalledTimes(1);
      const createData = deps.tx.collections.create.mock.calls[0]![0].data;
      expect(createData.amount_paise).toBe(-50000);
      expect(createData.is_reversal).toBe(true);
      expect(createData.original_collection_id).toBe('col-1');
      expect(createData.reversal_reason).toBe('Incorrect amount');
      expect(createData.loan_id).toBe('loan-1');
    });

    it('should create reverse allocations with negated amounts', async () => {
      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Wrong loan', idempotencyKey: 'rev-key-alloc' },
        'manager-1', 'manager',
      );

      expect(deps.tx.collection_allocations.create).toHaveBeenCalledTimes(1);
      const allocData = deps.tx.collection_allocations.create.mock.calls[0]![0].data;
      expect(allocData.penalty_paise).toBe(-0);
      expect(allocData.interest_paise).toBe(-10000);
      expect(allocData.principal_paise).toBe(-40000);
      expect(allocData.total_paise).toBe(-50000);
      expect(allocData.installment_id).toBe('s-1');
    });

    it('should restore installments to pre-collection paid amounts', async () => {
      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Restore test', idempotencyKey: 'rev-key-restore' },
        'manager-1', 'manager',
      );

      // Original schedule: principal_paid=40000, interest_paid=10000, penalty_paid=0
      // Original allocation: principal=40000, interest=10000, penalty=0
      // After reversal: principal_paid=0, interest_paid=0, penalty_paid=0
      expect(deps.collectionRepo.updateInstallment).toHaveBeenCalledTimes(1);
      const [instId, updateData] = deps.collectionRepo.updateInstallment.mock.calls[0]!;
      expect(instId).toBe('s-1');
      expect(updateData.principal_paid_paise).toBe(0);
      expect(updateData.interest_paid_paise).toBe(0);
      expect(updateData.penalty_paid_paise).toBe(0);
      expect(updateData.status).toBe('pending');
    });

    it('should create mirror journal entry with debits↔credits swapped', async () => {
      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Mirror test', idempotencyKey: 'rev-key-mirror' },
        'manager-1', 'manager',
      );

      expect(deps.accounting.createJournalEntry).toHaveBeenCalledTimes(1);
      const jeCall = deps.accounting.createJournalEntry.mock.calls[0]![0];

      // Original: DR Cash 50000, CR LR 40000, CR Int 10000
      // Mirror:   CR Cash 50000, DR LR 40000, DR Int 10000
      expect(jeCall.lines).toEqual([
        { accountId: 'acc-cash', debitPaise: 0, creditPaise: 50000 },
        { accountId: 'acc-lr', debitPaise: 40000, creditPaise: 0 },
        { accountId: 'acc-int', debitPaise: 10000, creditPaise: 0 },
      ]);

      // Mirror journal should be balanced
      const totalDebit = jeCall.lines.reduce(
        (s: number, l: { debitPaise: number }) => s + l.debitPaise, 0,
      );
      const totalCredit = jeCall.lines.reduce(
        (s: number, l: { creditPaise: number }) => s + l.creditPaise, 0,
      );
      expect(totalDebit).toBe(totalCredit);
    });

    it('should mark original receipt as reversed and generate compensating receipt', async () => {
      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Receipt test', idempotencyKey: 'rev-key-rcp' },
        'manager-1', 'manager',
      );

      // Original receipt marked as reversed
      expect(deps.receipt.markAsReversed).toHaveBeenCalledTimes(1);
      expect(deps.receipt.markAsReversed).toHaveBeenCalledWith(
        'rcp-1', 'rcp-rev-1', expect.anything(),
      );

      // Compensating receipt generated
      expect(deps.receipt.generateReceipt).toHaveBeenCalledTimes(1);
      const receiptCall = deps.receipt.generateReceipt.mock.calls[0]![0];
      expect(receiptCall.isReversal).toBe(true);
      expect(receiptCall.originalReceiptId).toBe('rcp-1');
      expect(receiptCall.amountPaise).toBe(-50000);
      expect(receiptCall.loanId).toBe('loan-1');
      expect(receiptCall.customerId).toBe('cust-1');
    });

    it('should update loan outstanding after reversal', async () => {
      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Outstanding test', idempotencyKey: 'rev-key-out' },
        'manager-1', 'manager',
      );

      expect(deps.collectionRepo.updateLoanOutstanding).toHaveBeenCalledTimes(1);
      const [loanId, updateData] = deps.collectionRepo.updateLoanOutstanding.mock.calls[0]!;
      expect(loanId).toBe('loan-1');
      // Outstanding should increase by the reversed amount
      // Original outstanding: 500000, reversed amount: 50000 → new: 550000
      expect(Number(updateData.cached_outstanding_paise)).toBe(550000);
    });

    it('should create audit log with reversal details', async () => {
      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Audit test reason', idempotencyKey: 'rev-key-audit' },
        'manager-1', 'manager',
      );

      expect(deps.audit.createAuditLog).toHaveBeenCalledTimes(1);
      const auditCall = deps.audit.createAuditLog.mock.calls[0]![0];
      expect(auditCall.action_type).toBe('collection_reversed');
      expect(auditCall.actor_id).toBe('manager-1');
      expect(auditCall.actor_role).toBe('manager');
      expect(auditCall.target_entity).toBe('collection');
      expect(auditCall.target_id).toBe('col-1');
      expect(auditCall.remarks).toBe('Audit test reason');
      expect(auditCall.before_state.collection_id).toBe('col-1');
      expect(auditCall.before_state.amount_paise).toBe(50000);
      expect(auditCall.after_state.reversal_collection_id).toBe('rev-col-1');
    });

    it('should return 201 with complete reversal result data', async () => {
      const result = await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Full flow', idempotencyKey: 'rev-key-full' },
        'manager-1', 'manager',
      );

      expect(result.statusCode).toBe(201);
      expect(result.data).toMatchObject({
        reversalCollectionId: 'rev-col-1',
        originalCollectionId: 'col-1',
        loanId: 'loan-1',
        loanNumber: 'LN-2024-00001',
        reversedAmountPaise: 50000,
        mirrorJournalEntryId: 'je-mirror-1',
        compensatingReceiptId: 'rcp-rev-1',
        compensatingReceiptNumber: 'RCP-2024-00002',
        reason: 'Full flow',
      });
    });

    it('should store idempotency result after successful reversal', async () => {
      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Idem store', idempotencyKey: 'rev-idem-store' },
        'manager-1', 'manager',
      );

      expect(deps.idempotency.store).toHaveBeenCalledTimes(1);
      const storeArgs = deps.idempotency.store.mock.calls[0]!;
      expect(storeArgs[0]).toBe('rev-idem-store');
      expect(storeArgs[1]).toBe('reversal');
      expect(storeArgs[2]).toBe(201);
    });

    it('should handle reversal with multiple allocations across installments', async () => {
      // Set up multiple allocations
      deps.tx.collection_allocations.findMany.mockResolvedValue([
        {
          id: 'alloc-1', installment_id: 's-1',
          penalty_paise: 5000n, interest_paise: 10000n,
          principal_paise: 20000n, total_paise: 35000n,
        },
        {
          id: 'alloc-2', installment_id: 's-2',
          penalty_paise: 0n, interest_paise: 10000n,
          principal_paise: 5000n, total_paise: 15000n,
        },
      ]);

      // Set up loan with two installments
      deps.collectionRepo.getLoanForCollection.mockResolvedValue({
        id: 'loan-1', loan_number: 'LN-2024-00001', customer_id: 'cust-1',
        status: 'active', cached_outstanding_paise: 500000n, dpd: 0,
        customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
        schedules: [
          {
            id: 's-1', due_date: new Date('2024-01-15'),
            principal_paise: 250000n, interest_paise: 25000n,
            principal_paid_paise: 20000n, interest_paid_paise: 10000n,
            penalty_paid_paise: 5000n,
          },
          {
            id: 's-2', due_date: new Date('2024-02-15'),
            principal_paise: 250000n, interest_paise: 25000n,
            principal_paid_paise: 5000n, interest_paid_paise: 10000n,
            penalty_paid_paise: 0n,
          },
        ],
      });

      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Multi alloc', idempotencyKey: 'rev-key-multi' },
        'manager-1', 'manager',
      );

      // Two reverse allocations created
      expect(deps.tx.collection_allocations.create).toHaveBeenCalledTimes(2);

      // Both installments restored
      expect(deps.collectionRepo.updateInstallment).toHaveBeenCalledTimes(2);

      // Verify first installment restoration
      const inst1Call = deps.collectionRepo.updateInstallment.mock.calls.find(
        (c: unknown[]) => c[0] === 's-1',
      );
      expect(inst1Call).toBeDefined();
      expect(inst1Call![1].principal_paid_paise).toBe(0);
      expect(inst1Call![1].interest_paid_paise).toBe(0);
      expect(inst1Call![1].penalty_paid_paise).toBe(0);
      expect(inst1Call![1].status).toBe('pending');

      // Verify second installment restoration
      const inst2Call = deps.collectionRepo.updateInstallment.mock.calls.find(
        (c: unknown[]) => c[0] === 's-2',
      );
      expect(inst2Call).toBeDefined();
      expect(inst2Call![1].principal_paid_paise).toBe(0);
      expect(inst2Call![1].interest_paid_paise).toBe(0);
      expect(inst2Call![1].penalty_paid_paise).toBe(0);
      expect(inst2Call![1].status).toBe('pending');
    });
  });

  // ── Requirement 9.2: Atomicity ─────────────────────────────────────────

  describe('Req 9.2 — Atomicity: failed step → no partial state', () => {
    it('should roll back when journal entry creation fails', async () => {
      deps.accounting.createJournalEntry.mockRejectedValue(
        new Error('Journal service unavailable'),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Fail JE', idempotencyKey: 'rev-atom-je' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('Journal service unavailable');

      // No idempotency stored — operation can be safely retried
      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when receipt generation fails', async () => {
      deps.receipt.generateReceipt.mockRejectedValue(
        new Error('Receipt service down'),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Fail receipt', idempotencyKey: 'rev-atom-rcp' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('Receipt service down');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when allocation creation fails', async () => {
      deps.tx.collection_allocations.create.mockRejectedValue(
        new Error('Allocation insert failed'),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Fail alloc', idempotencyKey: 'rev-atom-alloc' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('Allocation insert failed');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when installment update fails', async () => {
      deps.collectionRepo.updateInstallment.mockRejectedValue(
        new Error('Installment update failed'),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Fail inst', idempotencyKey: 'rev-atom-inst' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('Installment update failed');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when audit log creation fails', async () => {
      deps.audit.createAuditLog.mockRejectedValue(
        new Error('Audit service unavailable'),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Fail audit', idempotencyKey: 'rev-atom-audit' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('Audit service unavailable');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should roll back when outstanding update fails', async () => {
      deps.collectionRepo.updateLoanOutstanding.mockRejectedValue(
        new Error('Outstanding update failed'),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Fail outstanding', idempotencyKey: 'rev-atom-out' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('Outstanding update failed');

      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });

    it('should reject reversal of non-existent collection', async () => {
      deps.tx.collections.findUnique.mockResolvedValue(null);

      await expect(
        service.reverseCollection(
          { collectionId: 'col-missing', reason: 'Not found', idempotencyKey: 'rev-atom-nf' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject reversal when loan is not found', async () => {
      deps.collectionRepo.lockLoanForUpdate.mockResolvedValue(null);

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'No loan', idempotencyKey: 'rev-atom-loan' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── Requirement 9.3: Double-reversal rejection ─────────────────────────

  describe('Req 9.3 — Double-reversal rejection', () => {
    it('should throw ConflictError when reversing an already-reversed collection', async () => {
      deps.tx.collections.findUnique.mockResolvedValue(
        buildOriginalCollection({ status: 'reversed' }),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Double reversal', idempotencyKey: 'rev-double-1' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('should include descriptive message for double-reversal rejection', async () => {
      deps.tx.collections.findUnique.mockResolvedValue(
        buildOriginalCollection({ status: 'reversed' }),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-1', reason: 'Double reversal', idempotencyKey: 'rev-double-2' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('already been reversed');
    });

    it('should not create any records when double-reversal is rejected', async () => {
      deps.tx.collections.findUnique.mockResolvedValue(
        buildOriginalCollection({ status: 'reversed' }),
      );

      try {
        await service.reverseCollection(
          { collectionId: 'col-1', reason: 'Double', idempotencyKey: 'rev-double-3' },
          'manager-1', 'manager',
        );
      } catch {
        // expected
      }

      expect(deps.tx.collections.create).not.toHaveBeenCalled();
      expect(deps.tx.collection_allocations.create).not.toHaveBeenCalled();
      expect(deps.accounting.createJournalEntry).not.toHaveBeenCalled();
      expect(deps.receipt.generateReceipt).not.toHaveBeenCalled();
      expect(deps.audit.createAuditLog).not.toHaveBeenCalled();
      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });
  });

  // ── Requirement 9.4: Reversal-of-reversal rejection ────────────────────

  describe('Req 9.4 — Reversal-of-reversal rejection (no chained reversals)', () => {
    it('should throw BusinessRuleError when reversing a reversal entry', async () => {
      deps.tx.collections.findUnique.mockResolvedValue(
        buildOriginalCollection({
          id: 'col-rev', amount_paise: -50000n,
          status: 'posted', is_reversal: true,
        }),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-rev', reason: 'Chain attempt', idempotencyKey: 'rev-chain-1' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should include descriptive message for reversal-of-reversal rejection', async () => {
      deps.tx.collections.findUnique.mockResolvedValue(
        buildOriginalCollection({
          id: 'col-rev', amount_paise: -50000n,
          status: 'posted', is_reversal: true,
        }),
      );

      await expect(
        service.reverseCollection(
          { collectionId: 'col-rev', reason: 'Chain attempt', idempotencyKey: 'rev-chain-2' },
          'manager-1', 'manager',
        ),
      ).rejects.toThrow('Cannot reverse a reversal');
    });

    it('should not create any records when reversal-of-reversal is rejected', async () => {
      deps.tx.collections.findUnique.mockResolvedValue(
        buildOriginalCollection({
          id: 'col-rev', amount_paise: -50000n,
          status: 'posted', is_reversal: true,
        }),
      );

      try {
        await service.reverseCollection(
          { collectionId: 'col-rev', reason: 'Chain', idempotencyKey: 'rev-chain-3' },
          'manager-1', 'manager',
        );
      } catch {
        // expected
      }

      expect(deps.tx.collections.create).not.toHaveBeenCalled();
      expect(deps.tx.collection_allocations.create).not.toHaveBeenCalled();
      expect(deps.accounting.createJournalEntry).not.toHaveBeenCalled();
      expect(deps.receipt.generateReceipt).not.toHaveBeenCalled();
      expect(deps.audit.createAuditLog).not.toHaveBeenCalled();
      expect(deps.idempotency.store).not.toHaveBeenCalled();
    });
  });

  // ── Cross-cutting: Idempotency ─────────────────────────────────────────

  describe('Idempotency', () => {
    it('should return cached result for duplicate idempotency key without executing transaction', async () => {
      deps.idempotency.find.mockResolvedValue({
        resultStatus: 201,
        resultBody: { reversalCollectionId: 'cached-rev' },
      });

      const result = await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Dup', idempotencyKey: 'dup-rev-key' },
        'manager-1', 'manager',
      );

      expect(result.statusCode).toBe(201);
      expect(result.data).toEqual({ reversalCollectionId: 'cached-rev' });
      expect(deps.prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ── Cross-cutting: Mirror journal balance invariant ────────────────────

  describe('Mirror journal balance invariant', () => {
    it('should produce balanced mirror journal for multi-line original', async () => {
      // Set up a more complex original journal with penalty line
      deps.tx.journal_entries.findUnique.mockResolvedValue({
        id: 'je-complex',
        lines: [
          { account_id: 'acc-cash', debit_paise: 100000n, credit_paise: 0n },
          { account_id: 'acc-lr', debit_paise: 0n, credit_paise: 60000n },
          { account_id: 'acc-int', debit_paise: 0n, credit_paise: 30000n },
          { account_id: 'acc-pen', debit_paise: 0n, credit_paise: 10000n },
        ],
      });

      deps.tx.collections.findUnique.mockResolvedValue(
        buildOriginalCollection({ amount_paise: 100000n }),
      );

      await service.reverseCollection(
        { collectionId: 'col-1', reason: 'Balance test', idempotencyKey: 'rev-balance' },
        'manager-1', 'manager',
      );

      const jeCall = deps.accounting.createJournalEntry.mock.calls[0]![0];
      const totalDebit = jeCall.lines.reduce(
        (s: number, l: { debitPaise: number }) => s + l.debitPaise, 0,
      );
      const totalCredit = jeCall.lines.reduce(
        (s: number, l: { creditPaise: number }) => s + l.creditPaise, 0,
      );
      expect(totalDebit).toBe(totalCredit);
      expect(totalDebit).toBe(100000);

      // Verify the swap: original DR Cash → mirror CR Cash
      expect(jeCall.lines[0]).toEqual({
        accountId: 'acc-cash', debitPaise: 0, creditPaise: 100000,
      });
      // Original CR LR → mirror DR LR
      expect(jeCall.lines[1]).toEqual({
        accountId: 'acc-lr', debitPaise: 60000, creditPaise: 0,
      });
    });
  });
});
