import { Injectable, Inject, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationRepository } from './notification.repository';
import { SmsProvider, SMS_PROVIDER } from './sms-provider';

/**
 * Background outbox processor — polls for pending/retryable messages
 * every 10 seconds and dispatches SMS via the configured provider.
 *
 * Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent processing.
 * Retry with exponential backoff: 30s, 2min, 8min.
 * After max retries (default 3), moves to dead_letter (Requirement 18.4).
 *
 * SMS dispatch failures never affect finance transaction validity.
 */
@Injectable()
export class OutboxProcessor {
  private readonly logger = new Logger(OutboxProcessor.name);
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: NotificationRepository,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  /**
   * Process the next batch of outbox messages.
   * Called every 10 seconds by the scheduler.
   * Returns the number of messages processed.
   */
  @Interval(10_000)
  async processNextBatch(batchSize = 10): Promise<number> {
    // Prevent overlapping runs
    if (this.processing) {
      return 0;
    }

    this.processing = true;
    let processedCount = 0;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const rows = await this.repository.fetchProcessableBatch(batchSize, tx);

          for (const row of rows) {
            const message = await this.repository.markProcessing(row.id, tx);
            processedCount++;

            // Dispatch outside the lock transaction — SMS failure
            // must not roll back the status update
            this.dispatchMessage(message).catch((err) => {
              this.logger.error({
                msg: 'Unexpected error dispatching SMS',
                messageId: row.id,
                error: String(err),
              });
            });
          }
        },
        {
          timeout: 30_000, // 30 seconds - increased from default 5s to handle load
          maxWait: 10_000, // max time to wait for a connection
        },
      );
    } catch (err) {
      this.logger.error({
        msg: 'Outbox processor batch error',
        error: String(err),
      });
    } finally {
      this.processing = false;
    }

    if (processedCount > 0) {
      this.logger.log({ msg: 'Outbox batch processed', count: processedCount });
    }

    return processedCount;
  }

  /**
   * Dispatch a single SMS message via the provider.
   * On success, marks as sent. On failure, marks as failed with backoff scheduling.
   * All dispatch attempts are logged (Requirement 18.6).
   */
  private async dispatchMessage(message: {
    id: string;
    recipient_mobile: string;
    message_body: string;
    retry_count: number;
    max_retries: number;
  }) {
    try {
      const result = await this.smsProvider.send(
        message.recipient_mobile,
        message.message_body,
      );

      if (result.success) {
        await this.repository.markSent(message.id, {
          messageId: result.messageId,
          sentAt: new Date().toISOString(),
        });

        this.logger.log({
          msg: 'SMS sent successfully',
          messageId: message.id,
          providerMessageId: result.messageId,
        });
      } else {
        await this.repository.markFailed(
          message.id,
          message.retry_count,
          message.max_retries,
          { error: result.error, attemptedAt: new Date().toISOString() },
        );

        this.logger.warn({
          msg: 'SMS dispatch failed',
          messageId: message.id,
          retryCount: message.retry_count + 1,
          maxRetries: message.max_retries,
          error: result.error,
        });
      }
    } catch (err) {
      await this.repository.markFailed(
        message.id,
        message.retry_count,
        message.max_retries,
        { error: String(err), attemptedAt: new Date().toISOString() },
      );

      this.logger.error({
        msg: 'SMS dispatch threw exception',
        messageId: message.id,
        retryCount: message.retry_count + 1,
        error: String(err),
      });
    }
  }
}
