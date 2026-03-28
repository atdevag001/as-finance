import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../notification.service';
import { NotificationRepository } from '../notification.repository';
import { MockSmsProvider } from '../sms-provider';
import { NotFoundError } from '../../../common/errors/not-found.error';
import { BusinessRuleError } from '../../../common/errors/business-rule.error';

function createMockRepository() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    findTemplate: vi.fn(),
    resetForRetry: vi.fn(),
  } as unknown as NotificationRepository;
}

describe('NotificationService', () => {
  let service: NotificationService;
  let repo: ReturnType<typeof createMockRepository>;
  let smsProvider: MockSmsProvider;

  beforeEach(() => {
    repo = createMockRepository();
    smsProvider = new MockSmsProvider();
    service = new NotificationService(repo, smsProvider);
  });

  describe('enqueue', () => {
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
  });

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

  describe('retry', () => {
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
  });
});
