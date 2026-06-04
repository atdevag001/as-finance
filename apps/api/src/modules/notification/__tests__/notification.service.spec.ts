import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../notification.service';
import { NotificationRepository } from '../notification.repository';
import { OutboxProcessor } from '../outbox-processor';
import { MockSmsProvider, type SmsProvider } from '../sms-provider';
import { NotFoundError } from '../../../common/errors/not-found.error';
import { BusinessRuleError } from '../../../common/errors/business-rule.error';

/* ------------------------------------------------------------------ */
/*  Mock helpers                                                       */
/* ------------------------------------------------------------------ */

function createMockRepository() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    findTemplate: vi.fn(),
    resetForRetry: vi.fn(),
    fetchProcessableBatch: vi.fn(),
    markProcessing: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
  } as unknown as NotificationRepository;
}

function createMockPrisma() {
  return {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  } as never;
}

/* ------------------------------------------------------------------ */
/*  NotificationService tests                                          */
/* ------------------------------------------------------------------ */

describe('NotificationService', () => {
  let service: NotificationService;
  let repo: ReturnType<typeof createMockRepository>;
  let smsProvider: MockSmsProvider;

  beforeEach(() => {
    repo = createMockRepository();
    smsProvider = new MockSmsProvider();
    service = new NotificationService(repo, smsProvider);
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.1 — Outbox creation within transaction context     */
  /* ---------------------------------------------------------------- */
  describe('enqueue (outbox creation)', () => {
    it('should render template and create outbox message', async () => {
      const template = {
        id: 'tpl-1',
        template_body: 'Dear {{customerName}}, loan {{loanNumber}} approved.',
      };
      vi.mocked(repo.findTemplate).mockResolvedValue(template as never);
      vi.mocked(repo.create).mockResolvedValue({ id: 'msg-1', status: 'pending' } as never);

      const result = await service.enqueue({
        event_type: 'loan_approved',
        recipient_mobile: '9876543210',
        variables: { customerName: 'Rajesh', loanNumber: 'LN-2024-00001' },
        source_type: 'loan',
        source_id: 'loan-uuid',
      });

      expect(repo.findTemplate).toHaveBeenCalledWith('loan_approved', 'en');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          event_type: 'loan_approved',
          recipient_mobile: '9876543210',
          template_id: 'tpl-1',
          message_body: 'Dear Rajesh, loan LN-2024-00001 approved.',
          source_type: 'loan',
          source_id: 'loan-uuid',
          max_retries: 3,
        }),
        undefined,
      );
      expect(result).toEqual({ id: 'msg-1', status: 'pending' });
    });

    it('should use fallback message when template not found', async () => {
      vi.mocked(repo.findTemplate).mockResolvedValue(null);
      vi.mocked(repo.create).mockResolvedValue({ id: 'msg-2', status: 'pending' } as never);

      await service.enqueue({
        event_type: 'unknown_event',
        recipient_mobile: '9876543210',
        variables: {},
        source_type: 'test',
        source_id: 'test-uuid',
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          message_body: 'AS Finance notification: unknown_event',
          template_id: undefined,
        }),
        undefined,
      );
    });

    it('should pass transaction client to repository', async () => {
      vi.mocked(repo.findTemplate).mockResolvedValue(null);
      vi.mocked(repo.create).mockResolvedValue({ id: 'msg-3' } as never);

      const fakeTx = { outbox_messages: {} } as never;
      await service.enqueue(
        {
          event_type: 'disbursed',
          recipient_mobile: '9876543210',
          variables: {},
          source_type: 'disbursement',
          source_id: 'disb-uuid',
        },
        fakeTx,
      );

      expect(repo.create).toHaveBeenCalledWith(expect.anything(), fakeTx);
    });

    it('should respect custom max_retries', async () => {
      vi.mocked(repo.findTemplate).mockResolvedValue(null);
      vi.mocked(repo.create).mockResolvedValue({ id: 'msg-r' } as never);

      await service.enqueue({
        event_type: 'collection_receipt',
        recipient_mobile: '9876543210',
        variables: {},
        source_type: 'collection',
        source_id: 'col-uuid',
        max_retries: 5,
      });

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ max_retries: 5 }),
        undefined,
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.7 — Template lookup by event type and language     */
  /* ---------------------------------------------------------------- */
  describe('template lookup', () => {
    it('should look up template by event_type and default language "en"', async () => {
      vi.mocked(repo.findTemplate).mockResolvedValue(null);
      vi.mocked(repo.create).mockResolvedValue({ id: 'msg-4' } as never);

      await service.enqueue({
        event_type: 'collection_receipt',
        recipient_mobile: '9876543210',
        variables: {},
        source_type: 'collection',
        source_id: 'col-uuid',
      });

      expect(repo.findTemplate).toHaveBeenCalledWith('collection_receipt', 'en');
    });

    it('should look up template by event_type and specified language', async () => {
      vi.mocked(repo.findTemplate).mockResolvedValue({
        id: 'tpl-hi',
        template_body: 'प्रिय {{customerName}}, भुगतान प्राप्त।',
      } as never);
      vi.mocked(repo.create).mockResolvedValue({ id: 'msg-5' } as never);

      await service.enqueue({
        event_type: 'collection_receipt',
        recipient_mobile: '9876543210',
        variables: { customerName: 'राजेश' },
        source_type: 'collection',
        source_id: 'col-uuid',
        language: 'hi',
      });

      expect(repo.findTemplate).toHaveBeenCalledWith('collection_receipt', 'hi');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          template_id: 'tpl-hi',
          message_body: 'प्रिय राजेश, भुगतान प्राप्त।',
        }),
        undefined,
      );
    });

    it('should fall back to generic message when language-specific template is not found', async () => {
      vi.mocked(repo.findTemplate).mockResolvedValue(null);
      vi.mocked(repo.create).mockResolvedValue({ id: 'msg-6' } as never);

      await service.enqueue({
        event_type: 'loan_approved',
        recipient_mobile: '9876543210',
        variables: { customerName: 'Rajesh' },
        source_type: 'loan',
        source_id: 'loan-uuid',
        language: 'hi',
      });

      expect(repo.findTemplate).toHaveBeenCalledWith('loan_approved', 'hi');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          template_id: undefined,
          message_body: 'AS Finance notification: loan_approved',
        }),
        undefined,
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /*  findAll                                                          */
  /* ---------------------------------------------------------------- */
  describe('findAll', () => {
    it('should delegate to repository with query params', async () => {
      vi.mocked(repo.findAll).mockResolvedValue({ data: [], total: 0 });

      const result = await service.findAll({ status: 'failed', take: 10 });

      expect(repo.findAll).toHaveBeenCalledWith({
        skip: undefined,
        take: 10,
        status: 'failed',
        eventType: undefined,
      });
      expect(result).toEqual({ data: [], total: 0 });
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.6 — resetForRetry via service.retry               */
  /* ---------------------------------------------------------------- */
  describe('retry (resetForRetry)', () => {
    it('should reset a failed message for retry', async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: 'msg-1', status: 'failed' } as never);
      vi.mocked(repo.resetForRetry).mockResolvedValue({ id: 'msg-1', status: 'pending' } as never);

      const result = await service.retry('msg-1');

      expect(repo.resetForRetry).toHaveBeenCalledWith('msg-1');
      expect(result).toEqual({ id: 'msg-1', status: 'pending' });
    });

    it('should reset a dead_letter message for retry', async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: 'msg-2', status: 'dead_letter' } as never);
      vi.mocked(repo.resetForRetry).mockResolvedValue({ id: 'msg-2', status: 'pending' } as never);

      const result = await service.retry('msg-2');

      expect(repo.resetForRetry).toHaveBeenCalledWith('msg-2');
      expect(result).toEqual({ id: 'msg-2', status: 'pending' });
    });

    it('should throw NotFoundError for non-existent message', async () => {
      vi.mocked(repo.findById).mockResolvedValue(null);

      await expect(service.retry('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for non-retryable status', async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: 'msg-3', status: 'sent' } as never);

      await expect(service.retry('msg-3')).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for pending status', async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: 'msg-4', status: 'pending' } as never);

      await expect(service.retry('msg-4')).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for processing status', async () => {
      vi.mocked(repo.findById).mockResolvedValue({ id: 'msg-5', status: 'processing' } as never);

      await expect(service.retry('msg-5')).rejects.toThrow(BusinessRuleError);
    });
  });
});


/* ------------------------------------------------------------------ */
/*  OutboxProcessor tests                                              */
/*  Covers: fetchProcessableBatch (30.2), markSent (30.3),            */
/*          markFailed + backoff (30.4), dead_letter (30.5)           */
/* ------------------------------------------------------------------ */

describe('OutboxProcessor', () => {
  let processor: OutboxProcessor;
  let repo: ReturnType<typeof createMockRepository>;
  let smsProvider: { send: ReturnType<typeof vi.fn> };
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    repo = createMockRepository();
    smsProvider = { send: vi.fn() };
    mockPrisma = createMockPrisma();
    processor = new OutboxProcessor(
      mockPrisma,
      repo as unknown as NotificationRepository,
      smsProvider as unknown as SmsProvider,
    );
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.2 — fetchProcessableBatch                         */
  /* ---------------------------------------------------------------- */
  describe('processNextBatch / fetchProcessableBatch', () => {
    it('should fetch pending messages and mark them as processing', async () => {
      const rows = [{ id: 'msg-a' }, { id: 'msg-b' }];
      vi.mocked(repo.fetchProcessableBatch).mockResolvedValue(rows as never);
      vi.mocked(repo.markProcessing).mockImplementation(async (id: string) => ({
        id,
        recipient_mobile: '9876543210',
        message_body: 'Hello',
        retry_count: 0,
        max_retries: 3,
      }));
      smsProvider.send.mockResolvedValue({ success: true, messageId: 'sms-1' });

      const count = await processor.processNextBatch(10);

      expect(repo.fetchProcessableBatch).toHaveBeenCalledWith(10, expect.anything());
      expect(repo.markProcessing).toHaveBeenCalledTimes(2);
      expect(count).toBe(2);
    });

    it('should return 0 when no processable messages exist', async () => {
      vi.mocked(repo.fetchProcessableBatch).mockResolvedValue([]);

      const count = await processor.processNextBatch(10);

      expect(count).toBe(0);
      expect(repo.markProcessing).not.toHaveBeenCalled();
    });

    it('should use the provided batch size', async () => {
      vi.mocked(repo.fetchProcessableBatch).mockResolvedValue([]);

      await processor.processNextBatch(5);

      expect(repo.fetchProcessableBatch).toHaveBeenCalledWith(5, expect.anything());
    });

    it('should default batch size to 10', async () => {
      vi.mocked(repo.fetchProcessableBatch).mockResolvedValue([]);

      await processor.processNextBatch();

      expect(repo.fetchProcessableBatch).toHaveBeenCalledWith(10, expect.anything());
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.3 — markSent on successful SMS dispatch           */
  /* ---------------------------------------------------------------- */
  describe('markSent (successful dispatch)', () => {
    it('should mark message as sent when SMS provider succeeds', async () => {
      vi.mocked(repo.fetchProcessableBatch).mockResolvedValue([{ id: 'msg-s1' }] as never);
      vi.mocked(repo.markProcessing).mockResolvedValue({
        id: 'msg-s1',
        recipient_mobile: '9876543210',
        message_body: 'Payment received',
        retry_count: 0,
        max_retries: 3,
      } as never);
      smsProvider.send.mockResolvedValue({ success: true, messageId: 'provider-123' });

      await processor.processNextBatch(1);

      // Allow async dispatch to settle
      await new Promise((r) => setTimeout(r, 50));

      expect(smsProvider.send).toHaveBeenCalledWith('9876543210', 'Payment received');
      expect(repo.markSent).toHaveBeenCalledWith(
        'msg-s1',
        expect.objectContaining({ messageId: 'provider-123' }),
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.4 — markFailed with exponential backoff           */
  /*  Backoff: 30s * 4^retryCount → 30s, 120s, 480s                  */
  /* ---------------------------------------------------------------- */
  describe('markFailed (exponential backoff)', () => {
    it('should mark message as failed when SMS provider returns failure', async () => {
      vi.mocked(repo.fetchProcessableBatch).mockResolvedValue([{ id: 'msg-f1' }] as never);
      vi.mocked(repo.markProcessing).mockResolvedValue({
        id: 'msg-f1',
        recipient_mobile: '9876543210',
        message_body: 'Hello',
        retry_count: 0,
        max_retries: 3,
      } as never);
      smsProvider.send.mockResolvedValue({ success: false, error: 'Provider timeout' });

      await processor.processNextBatch(1);
      await new Promise((r) => setTimeout(r, 50));

      expect(repo.markFailed).toHaveBeenCalledWith(
        'msg-f1',
        0,
        3,
        expect.objectContaining({ error: 'Provider timeout' }),
      );
    });

    it('should mark message as failed when SMS provider throws exception', async () => {
      vi.mocked(repo.fetchProcessableBatch).mockResolvedValue([{ id: 'msg-f2' }] as never);
      vi.mocked(repo.markProcessing).mockResolvedValue({
        id: 'msg-f2',
        recipient_mobile: '9876543210',
        message_body: 'Hello',
        retry_count: 1,
        max_retries: 3,
      } as never);
      smsProvider.send.mockRejectedValue(new Error('Network error'));

      await processor.processNextBatch(1);
      await new Promise((r) => setTimeout(r, 50));

      expect(repo.markFailed).toHaveBeenCalledWith(
        'msg-f2',
        1,
        3,
        expect.objectContaining({ error: 'Error: Network error' }),
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.5 — dead_letter after max retries                 */
  /*  This is verified at the repository level — the processor passes  */
  /*  retry_count and max_retries; the repo decides dead_letter.       */
  /* ---------------------------------------------------------------- */
  describe('dead_letter transition (max retries exhausted)', () => {
    it('should pass retry_count at max-1 so repository transitions to dead_letter', async () => {
      vi.mocked(repo.fetchProcessableBatch).mockResolvedValue([{ id: 'msg-dl' }] as never);
      vi.mocked(repo.markProcessing).mockResolvedValue({
        id: 'msg-dl',
        recipient_mobile: '9876543210',
        message_body: 'Hello',
        retry_count: 2,
        max_retries: 3,
      } as never);
      smsProvider.send.mockResolvedValue({ success: false, error: 'Permanent failure' });

      await processor.processNextBatch(1);
      await new Promise((r) => setTimeout(r, 50));

      // retryCount=2, maxRetries=3 → newRetryCount=3 >= maxRetries → dead_letter
      expect(repo.markFailed).toHaveBeenCalledWith(
        'msg-dl',
        2,
        3,
        expect.objectContaining({ error: 'Permanent failure' }),
      );
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Concurrency guard — prevent overlapping runs                     */
  /* ---------------------------------------------------------------- */
  describe('concurrency guard', () => {
    it('should not process if already processing', async () => {
      // Simulate a slow transaction
      mockPrisma.$transaction.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200)),
      );

      const p1 = processor.processNextBatch(10);
      // Second call while first is still running
      const count2 = await processor.processNextBatch(10);

      expect(count2).toBe(0);
      await p1;
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Error resilience — batch error does not crash                    */
  /* ---------------------------------------------------------------- */
  describe('error resilience', () => {
    it('should handle transaction errors gracefully and return 0', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('DB connection lost'));

      const count = await processor.processNextBatch(10);

      expect(count).toBe(0);
    });
  });
});


/* ------------------------------------------------------------------ */
/*  NotificationRepository unit tests (backoff & dead_letter logic)    */
/*  Covers: markSent (30.3), markFailed backoff (30.4),               */
/*          dead_letter (30.5), resetForRetry (30.6)                  */
/* ------------------------------------------------------------------ */

describe('NotificationRepository', () => {
  let repository: NotificationRepository;
  let mockPrisma: Record<string, unknown>;

  beforeEach(() => {
    mockPrisma = {
      outbox_messages: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      sms_templates: {
        findUnique: vi.fn(),
      },
    };
    // Construct repository with mock prisma
    repository = new NotificationRepository(mockPrisma as never);
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.1 — Outbox creation                               */
  /* ---------------------------------------------------------------- */
  describe('create', () => {
    it('should create an outbox message with default max_retries', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.create.mockResolvedValue({ id: 'new-1', status: 'pending' });

      const result = await repository.create({
        event_type: 'loan_approved',
        recipient_mobile: '9876543210',
        message_body: 'Approved!',
        variables: { name: 'Test' },
        source_type: 'loan',
        source_id: 'loan-1',
      });

      expect(outbox.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            event_type: 'loan_approved',
            max_retries: 3,
          }),
        }),
      );
      expect(result).toEqual({ id: 'new-1', status: 'pending' });
    });

    it('should create outbox message within a transaction client', async () => {
      const txClient = {
        outbox_messages: {
          create: vi.fn().mockResolvedValue({ id: 'tx-1', status: 'pending' }),
        },
      };

      const result = await repository.create(
        {
          event_type: 'disbursed',
          recipient_mobile: '9876543210',
          message_body: 'Disbursed!',
          variables: {},
          source_type: 'disbursement',
          source_id: 'disb-1',
        },
        txClient as never,
      );

      expect(txClient.outbox_messages.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 'tx-1', status: 'pending' });
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.3 — markSent                                      */
  /* ---------------------------------------------------------------- */
  describe('markSent', () => {
    it('should update status to sent with provider response and processed_at', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.update.mockResolvedValue({
        id: 'msg-1',
        status: 'sent',
        processed_at: new Date(),
        provider_response: { messageId: 'sms-123' },
      });

      const result = await repository.markSent('msg-1', { messageId: 'sms-123' });

      expect(outbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1' },
          data: expect.objectContaining({
            status: 'sent',
            processed_at: expect.any(Date),
            provider_response: { messageId: 'sms-123' },
          }),
        }),
      );
      expect(result.status).toBe('sent');
      expect(result.processed_at).toBeInstanceOf(Date);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.4 — markFailed with exponential backoff           */
  /*  Formula: 30 * 4^retryCount seconds                              */
  /*  retry 0 → 30s, retry 1 → 120s, retry 2 → 480s                 */
  /* ---------------------------------------------------------------- */
  describe('markFailed (exponential backoff)', () => {
    it('should schedule retry with 30s backoff on first failure (retryCount=0)', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.update.mockResolvedValue({ id: 'msg-1', status: 'failed', retry_count: 1 });

      const before = Date.now();
      await repository.markFailed('msg-1', 0, 3, { error: 'timeout' });
      const after = Date.now();

      const call = outbox.update.mock.calls[0][0];
      expect(call.data.status).toBe('failed');
      expect(call.data.retry_count).toBe(1);

      const nextRetry = call.data.next_retry_at as Date;
      // 30 * 4^0 = 30 seconds
      const expectedMin = before + 30 * 1000;
      const expectedMax = after + 30 * 1000 + 100; // small tolerance
      expect(nextRetry.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(nextRetry.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('should schedule retry with 120s backoff on second failure (retryCount=1)', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.update.mockResolvedValue({ id: 'msg-1', status: 'failed', retry_count: 2 });

      const before = Date.now();
      await repository.markFailed('msg-1', 1, 3, { error: 'timeout' });
      const after = Date.now();

      const call = outbox.update.mock.calls[0][0];
      expect(call.data.retry_count).toBe(2);

      const nextRetry = call.data.next_retry_at as Date;
      // 30 * 4^1 = 120 seconds
      const expectedMin = before + 120 * 1000;
      const expectedMax = after + 120 * 1000 + 100;
      expect(nextRetry.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(nextRetry.getTime()).toBeLessThanOrEqual(expectedMax);
    });

    it('should schedule retry with 480s backoff on third failure (retryCount=2, maxRetries=4)', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.update.mockResolvedValue({ id: 'msg-1', status: 'failed', retry_count: 3 });

      const before = Date.now();
      await repository.markFailed('msg-1', 2, 4, { error: 'timeout' });
      const after = Date.now();

      const call = outbox.update.mock.calls[0][0];
      expect(call.data.retry_count).toBe(3);

      const nextRetry = call.data.next_retry_at as Date;
      // 30 * 4^2 = 480 seconds
      const expectedMin = before + 480 * 1000;
      const expectedMax = after + 480 * 1000 + 100;
      expect(nextRetry.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(nextRetry.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.5 — dead_letter after max retries                 */
  /* ---------------------------------------------------------------- */
  describe('markFailed (dead_letter transition)', () => {
    it('should transition to dead_letter when newRetryCount >= maxRetries', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.update.mockResolvedValue({
        id: 'msg-dl',
        status: 'dead_letter',
        retry_count: 3,
        processed_at: new Date(),
      });

      await repository.markFailed('msg-dl', 2, 3, { error: 'permanent' });

      const call = outbox.update.mock.calls[0][0];
      expect(call.data.status).toBe('dead_letter');
      expect(call.data.retry_count).toBe(3);
      expect(call.data.processed_at).toBeInstanceOf(Date);
      // dead_letter should NOT set next_retry_at
      expect(call.data.next_retry_at).toBeUndefined();
    });

    it('should transition to dead_letter when retryCount already at max', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.update.mockResolvedValue({ id: 'msg-dl2', status: 'dead_letter' });

      await repository.markFailed('msg-dl2', 4, 3, { error: 'permanent' });

      const call = outbox.update.mock.calls[0][0];
      expect(call.data.status).toBe('dead_letter');
      expect(call.data.retry_count).toBe(5);
    });

    it('should NOT transition to dead_letter when retries remain', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.update.mockResolvedValue({ id: 'msg-ok', status: 'failed', retry_count: 1 });

      await repository.markFailed('msg-ok', 0, 3, { error: 'transient' });

      const call = outbox.update.mock.calls[0][0];
      expect(call.data.status).toBe('failed');
      expect(call.data.next_retry_at).toBeInstanceOf(Date);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.6 — resetForRetry                                 */
  /* ---------------------------------------------------------------- */
  describe('resetForRetry', () => {
    it('should reset status to pending with zeroed retry_count', async () => {
      const outbox = mockPrisma['outbox_messages'] as Record<string, ReturnType<typeof vi.fn>>;
      outbox.update.mockResolvedValue({ id: 'msg-r', status: 'pending', retry_count: 0 });

      const result = await repository.resetForRetry('msg-r');

      expect(outbox.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-r' },
          data: expect.objectContaining({
            status: 'pending',
            retry_count: 0,
            next_retry_at: null,
            provider_response: null,
          }),
        }),
      );
      expect(result.status).toBe('pending');
      expect(result.retry_count).toBe(0);
    });
  });

  /* ---------------------------------------------------------------- */
  /*  Requirement 30.7 — findTemplate                                  */
  /* ---------------------------------------------------------------- */
  describe('findTemplate', () => {
    it('should look up template by event_type and language', async () => {
      const templates = mockPrisma['sms_templates'] as Record<string, ReturnType<typeof vi.fn>>;
      templates.findUnique.mockResolvedValue({
        id: 'tpl-1',
        event_type: 'loan_approved',
        language: 'en',
        template_body: 'Dear {{name}}, approved.',
      });

      const result = await repository.findTemplate('loan_approved', 'en');

      expect(templates.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            idx_sms_templates_event_lang: {
              event_type: 'loan_approved',
              language: 'en',
            },
          },
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ event_type: 'loan_approved', language: 'en' }),
      );
    });

    it('should return null when template does not exist', async () => {
      const templates = mockPrisma['sms_templates'] as Record<string, ReturnType<typeof vi.fn>>;
      templates.findUnique.mockResolvedValue(null);

      const result = await repository.findTemplate('nonexistent', 'en');

      expect(result).toBeNull();
    });

    it('should default language to "en"', async () => {
      const templates = mockPrisma['sms_templates'] as Record<string, ReturnType<typeof vi.fn>>;
      templates.findUnique.mockResolvedValue(null);

      await repository.findTemplate('loan_approved');

      expect(templates.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            idx_sms_templates_event_lang: {
              event_type: 'loan_approved',
              language: 'en',
            },
          },
        }),
      );
    });
  });
});
