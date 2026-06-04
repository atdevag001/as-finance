import { describe, it, expect, vi } from 'vitest';
import { NotificationService } from '../notification.service';
import type { NotificationRepository } from '../notification.repository';
import { MockSmsProvider } from '../sms-provider';
import { CollectionService } from '../../collection/collection.service';

function createMockNotifRepo() {
  return {
    create: vi.fn().mockResolvedValue({ id: 'msg-1', event_type: 'collection_receipt', recipient_mobile: '9876543210', message_body: 'Payment received', status: 'pending', retry_count: 0, max_retries: 3, variables: {}, created_at: new Date() }),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    findById: vi.fn(), findTemplate: vi.fn(), resetForRetry: vi.fn(),
    fetchProcessableBatch: vi.fn(), markProcessing: vi.fn(), markSent: vi.fn(), markFailed: vi.fn(),
  } as unknown as NotificationRepository;
}

function createMockColRepo() {
  return {
    lockLoanForUpdate: vi.fn().mockResolvedValue({ id: 'loan-1', status: 'active', cached_outstanding_paise: 550000n }),
    getLoanForCollection: vi.fn().mockResolvedValue({
      id: 'loan-1', loan_number: 'LN-2024-00001', customer_id: 'cust-1', principal_paise: 500000n, status: 'active', total_payable_paise: 550000n, cached_outstanding_paise: 550000n, dpd: 0, overdue_bucket: null,
      product_version: { id: 'pv-1', allocation_order: ['penalty', 'interest', 'principal'] },
      customer: { id: 'cust-1', full_name: 'Test Customer', mobile: '9876543210' },
      schedules: [{ id: 'sched-1', installment_number: 1, due_date: new Date('2024-02-01'), principal_paise: 500000n, interest_paise: 50000n, total_paise: 550000n, principal_paid_paise: 0n, interest_paid_paise: 0n, penalty_paid_paise: 0n, status: 'pending' }],
    }),
    getPendingPenalties: vi.fn().mockResolvedValue([]),
    createCollection: vi.fn().mockResolvedValue({ id: 'col-1', loan_id: 'loan-1' }),
    createAllocations: vi.fn().mockResolvedValue([]),
    updateInstallment: vi.fn().mockResolvedValue({}),
    updateLoanOutstanding: vi.fn().mockResolvedValue({}),
    findAccountByCode: vi.fn().mockImplementation((code: string) => {
      const accs: Record<string, { id: string; code: string; name: string; category: string }> = {
        '1001': { id: 'acc-cash', code: '1001', name: 'Cash', category: 'asset' },
        '1002': { id: 'acc-bank', code: '1002', name: 'Bank', category: 'asset' },
        '1100': { id: 'acc-lr', code: '1100', name: 'Loans Receivable', category: 'asset' },
        '4001': { id: 'acc-ii', code: '4001', name: 'Interest Income', category: 'income' },
        '4003': { id: 'acc-pi', code: '4003', name: 'Penalty Income', category: 'income' },
      };
      return Promise.resolve(accs[code] ?? null);
    }),
    getOfficerName: vi.fn().mockResolvedValue('Test Officer'),
    enqueueOutboxMessage: vi.fn().mockResolvedValue({ id: 'outbox-1', status: 'pending' }),
  };
}

describe('Notification Outbox Integration', () => {
  describe('Req 31.1 - Outbox message created even when SMS provider unavailable', () => {
    it('should create outbox message regardless of SMS provider state', async () => {
      const repo = createMockNotifRepo();
      const sms = new MockSmsProvider();
      const svc = new NotificationService(repo, sms);
      const result = await svc.enqueue({ event_type: 'collection_receipt', recipient_mobile: '9876543210', variables: { customer_name: 'Test' }, source_type: 'collection', source_id: 'col-1' });
      expect(result).toBeDefined();
      expect(result.id).toBe('msg-1');
      expect(result.status).toBe('pending');
      expect(repo.create).toHaveBeenCalledOnce();
    });

    it('should use fallback message when template not found', async () => {
      const repo = createMockNotifRepo();
      vi.mocked(repo.findTemplate).mockResolvedValue(null);
      const svc = new NotificationService(repo, new MockSmsProvider());
      const result = await svc.enqueue({ event_type: 'unknown_event', recipient_mobile: '9876543210', variables: {}, source_type: 'collection', source_id: 'col-1' });
      expect(result.status).toBe('pending');
      const call = vi.mocked(repo.create).mock.calls[0][0];
      expect(call.message_body).toContain('AS Finance notification');
    });

    it('should pass transaction client to repository create', async () => {
      const repo = createMockNotifRepo();
      vi.mocked(repo.findTemplate).mockResolvedValue({ id: 'tpl-1', template_body: 'Payment of {{amount}} received.' } as never);
      const svc = new NotificationService(repo, new MockSmsProvider());
      const mockTx = {} as never;
      await svc.enqueue({ event_type: 'collection_receipt', recipient_mobile: '9876543210', variables: { amount: '500' }, source_type: 'collection', source_id: 'col-1' }, mockTx);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'collection_receipt' }), mockTx);
    });
  });

  describe('Req 31.2 - Notification enqueued within same transaction', () => {
    it('should enqueue outbox message within collection transaction', async () => {
      const colRepo = createMockColRepo();
      const svc = new CollectionService(
        { $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) } as never,
        colRepo as never,
        { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) } as never,
        { createAuditLog: vi.fn().mockResolvedValue({}) } as never,
        { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) } as never,
        { generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-1', receipt_number: 'RCP-2024-00001' }) } as never,
      );
      await svc.postCollection({ loanId: 'loan-1', amountPaise: 550000, paymentDate: '2024-02-01', paymentMode: 'cash', idempotencyKey: 'test-key-1' }, 'officer-1', 'collection_officer');
      expect(colRepo.enqueueOutboxMessage).toHaveBeenCalledOnce();
      const call = colRepo.enqueueOutboxMessage.mock.calls[0];
      expect(call[0]).toMatchObject({ event_type: 'collection_receipt', recipient_mobile: '9876543210', source_type: 'collection' });
      expect(call[1]).toBeDefined();
    });

    it('should include correct variables in outbox message', async () => {
      const colRepo = createMockColRepo();
      const svc = new CollectionService(
        { $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) } as never,
        colRepo as never,
        { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) } as never,
        { createAuditLog: vi.fn().mockResolvedValue({}) } as never,
        { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) } as never,
        { generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-1', receipt_number: 'RCP-2024-00001' }) } as never,
      );
      await svc.postCollection({ loanId: 'loan-1', amountPaise: 550000, paymentDate: '2024-02-01', paymentMode: 'cash', idempotencyKey: 'test-key-2' }, 'officer-1', 'collection_officer');
      const data = colRepo.enqueueOutboxMessage.mock.calls[0][0];
      expect(data.variables).toMatchObject({ customer_name: 'Test Customer', loan_number: 'LN-2024-00001', amount_paise: '550000', receipt_number: 'RCP-2024-00001' });
    });
  });

  describe('Req 31.3 - Finance operation and notification isolation', () => {
    it('should propagate outbox failure within transaction boundary', async () => {
      const colRepo = createMockColRepo();
      colRepo.enqueueOutboxMessage.mockRejectedValue(new Error('SMS outbox unavailable'));
      const svc = new CollectionService(
        { $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})) } as never,
        colRepo as never,
        { createJournalEntry: vi.fn().mockResolvedValue({ id: 'je-1' }) } as never,
        { createAuditLog: vi.fn().mockResolvedValue({}) } as never,
        { find: vi.fn().mockResolvedValue(null), store: vi.fn().mockResolvedValue({}) } as never,
        { generateReceipt: vi.fn().mockResolvedValue({ id: 'rcp-1', receipt_number: 'RCP-2024-00001' }) } as never,
      );
      await expect(svc.postCollection({ loanId: 'loan-1', amountPaise: 550000, paymentDate: '2024-02-01', paymentMode: 'cash', idempotencyKey: 'test-key-3' }, 'officer-1', 'collection_officer')).rejects.toThrow('SMS outbox unavailable');
      expect(colRepo.createCollection).toHaveBeenCalledOnce();
    });

    it('should allow enqueue to succeed independently of SMS provider', async () => {
      const repo = createMockNotifRepo();
      const failSms = { send: vi.fn().mockRejectedValue(new Error('SMS gateway down')) };
      const svc = new NotificationService(repo, failSms as never);
      const result = await svc.enqueue({ event_type: 'collection_receipt', recipient_mobile: '9876543210', variables: {}, source_type: 'collection', source_id: 'col-1' });
      expect(result.status).toBe('pending');
      expect(failSms.send).not.toHaveBeenCalled();
    });

    it('should create outbox message with correct max_retries', async () => {
      const repo = createMockNotifRepo();
      const svc = new NotificationService(repo, new MockSmsProvider());
      await svc.enqueue({ event_type: 'collection_receipt', recipient_mobile: '9876543210', variables: {}, source_type: 'collection', source_id: 'col-1', max_retries: 5 });
      const call = vi.mocked(repo.create).mock.calls[0][0];
      expect(call.max_retries).toBe(5);
    });
  });

  describe('Template rendering during enqueue', () => {
    it('should render template variables into message body', async () => {
      const repo = createMockNotifRepo();
      vi.mocked(repo.findTemplate).mockResolvedValue({ id: 'tpl-1', template_body: 'Dear {{customerName}}, Rs {{amount}} received for loan {{loanNumber}}.' } as never);
      const svc = new NotificationService(repo, new MockSmsProvider());
      await svc.enqueue({ event_type: 'collection_receipt', recipient_mobile: '9876543210', variables: { customerName: 'Ramesh', amount: '5000', loanNumber: 'LN-2024-00001' }, source_type: 'collection', source_id: 'col-1' });
      const call = vi.mocked(repo.create).mock.calls[0][0];
      expect(call.message_body).toBe('Dear Ramesh, Rs 5000 received for loan LN-2024-00001.');
      expect(call.template_id).toBe('tpl-1');
    });
  });
});