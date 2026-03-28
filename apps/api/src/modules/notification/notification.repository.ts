import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface CreateOutboxMessageData {
  event_type: string;
  recipient_mobile: string;
  template_id?: string;
  message_body: string;
  variables: Record<string, string>;
  source_type: string;
  source_id: string;
  max_retries?: number;
}

export interface OutboxQueryParams {
  skip?: number;
  take?: number;
  status?: string;
  eventType?: string;
}

const OUTBOX_SELECT = {
  id: true,
  event_type: true,
  recipient_mobile: true,
  template_id: true,
  message_body: true,
  variables: true,
  status: true,
  retry_count: true,
  max_retries: true,
  next_retry_at: true,
  provider_response: true,
  source_type: true,
  source_id: true,
  created_at: true,
  processed_at: true,
};

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an outbox message. Accepts an optional Prisma transaction client
   * so the message is enqueued within the same transaction as the finance operation.
   */
  async create(data: CreateOutboxMessageData, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return (client as TxClient)['outbox_messages'].create({
      data: {
        event_type: data.event_type as never,
        recipient_mobile: data.recipient_mobile,
        template_id: data.template_id ?? null,
        message_body: data.message_body,
        variables: data.variables as never,
        source_type: data.source_type,
        source_id: data.source_id,
        max_retries: data.max_retries ?? 3,
      },
      select: OUTBOX_SELECT,
    });
  }

  /**
   * Find outbox messages with filtering and pagination.
   */
  async findAll(params: OutboxQueryParams) {
    const where: Record<string, unknown> = {};

    if (params.status) {
      where['status'] = params.status;
    }
    if (params.eventType) {
      where['event_type'] = params.eventType;
    }

    const [data, total] = await Promise.all([
      this.prisma['outbox_messages'].findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 50,
        orderBy: { created_at: 'desc' },
        select: OUTBOX_SELECT,
      }),
      this.prisma['outbox_messages'].count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Find a single outbox message by ID.
   */
  async findById(id: string) {
    return this.prisma['outbox_messages'].findUnique({
      where: { id },
      select: OUTBOX_SELECT,
    });
  }

  /**
   * Fetch the next batch of pending/failed messages eligible for processing.
   * Uses SELECT ... FOR UPDATE SKIP LOCKED to allow concurrent processors
   * without contention.
   */
  async fetchProcessableBatch(batchSize: number, tx: TxClient) {
    const now = new Date();
    return tx.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM outbox_messages
       WHERE (status = 'pending' OR (status = 'failed' AND next_retry_at <= $1))
         AND retry_count < max_retries
       ORDER BY created_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      now,
      batchSize,
    );
  }

  /**
   * Mark a message as processing.
   */
  async markProcessing(id: string, tx: TxClient) {
    return tx['outbox_messages'].update({
      where: { id },
      data: { status: 'processing' as never },
      select: OUTBOX_SELECT,
    });
  }

  /**
   * Mark a message as sent.
   */
  async markSent(id: string, providerResponse: unknown) {
    return this.prisma['outbox_messages'].update({
      where: { id },
      data: {
        status: 'sent' as never,
        provider_response: providerResponse as never,
        processed_at: new Date(),
      },
      select: OUTBOX_SELECT,
    });
  }

  /**
   * Mark a message as failed with retry scheduling.
   * Exponential backoff: 30s, 2min, 8min (30 * 4^retryCount seconds).
   * After max retries, move to dead_letter.
   */
  async markFailed(id: string, retryCount: number, maxRetries: number, providerResponse: unknown) {
    const newRetryCount = retryCount + 1;

    if (newRetryCount >= maxRetries) {
      return this.prisma['outbox_messages'].update({
        where: { id },
        data: {
          status: 'dead_letter' as never,
          retry_count: newRetryCount,
          provider_response: providerResponse as never,
          processed_at: new Date(),
        },
        select: OUTBOX_SELECT,
      });
    }

    // Exponential backoff: 30s, 120s (2min), 480s (8min)
    const backoffSeconds = 30 * Math.pow(4, retryCount);
    const nextRetryAt = new Date(Date.now() + backoffSeconds * 1000);

    return this.prisma['outbox_messages'].update({
      where: { id },
      data: {
        status: 'failed' as never,
        retry_count: newRetryCount,
        next_retry_at: nextRetryAt,
        provider_response: providerResponse as never,
      },
      select: OUTBOX_SELECT,
    });
  }

  /**
   * Reset a dead_letter or failed message for manual retry.
   */
  async resetForRetry(id: string) {
    return this.prisma['outbox_messages'].update({
      where: { id },
      data: {
        status: 'pending' as never,
        retry_count: 0,
        next_retry_at: null,
        provider_response: null as never,
      },
      select: OUTBOX_SELECT,
    });
  }

  /**
   * Find an SMS template by event type and language.
   */
  async findTemplate(eventType: string, language = 'en') {
    return this.prisma['sms_templates'].findUnique({
      where: {
        idx_sms_templates_event_lang: {
          event_type: eventType as never,
          language,
        },
      },
    });
  }
}
