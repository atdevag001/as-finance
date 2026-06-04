import { Injectable, Inject, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { NotificationRepository } from './notification.repository';
import { SmsProvider, SMS_PROVIDER } from './sms-provider';

/**
 * Outcome of a single SMS send attempt — used to bridge Phase 2 (dispatch)
 * and Phase 3 (persist) without thrown exceptions crossing phase boundaries.
 */
type SendOutcome =
  | { kind: 'sent'; providerMessageId: string | undefined }
  | { kind: 'failed'; error: string }
  | { kind: 'threw'; error: unknown };

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
   *
   * Three-phase pipeline (Requirement 18 — outbox race-free dispatch):
   *   1) Short tx — lock + mark-processing the batch with FOR UPDATE SKIP LOCKED,
   *      then COMMIT. This releases row locks before any external I/O.
   *   2) Dispatch SMS concurrently OUTSIDE the tx via Promise.allSettled, so a
   *      slow provider can't pin a Postgres connection for the whole batch.
   *   3) For each result, write the terminal state (markSent / markFailed)
   *      on the base client. Failures here are isolated per-message.
   *
   * The `processing` flag is only cleared once all three phases finish, so
   * the next @Interval tick cannot start a parallel pass and double-dispatch.
   */
  @Interval(10_000)
  async processNextBatch(batchSize = 10): Promise<number> {
    // Prevent overlapping runs
    if (this.processing) {
      return 0;
    }

    this.processing = true;
    let processedCount = 0;

    type LockedMessage = {
      id: string;
      recipient_mobile: string;
      message_body: string;
      retry_count: number;
      max_retries: number;
    };

    try {
      // ── Phase 1 ──────────────────────────────────────────────────────────
      // Short transaction: lock the batch and flip status → processing.
      // No external I/O inside this tx, so the row locks are released quickly
      // and other processor replicas can move on to other rows.
      const lockedMessages: LockedMessage[] = await this.prisma.$transaction(
        async (tx) => {
          const rows = await this.repository.fetchProcessableBatch(batchSize, tx);
          const messages: LockedMessage[] = [];
          for (const row of rows) {
            const message = await this.repository.markProcessing(row.id, tx);
            messages.push(message as LockedMessage);
          }
          return messages;
        },
        {
          timeout: 10_000,
          maxWait: 10_000,
        },
      );

      processedCount = lockedMessages.length;

      if (processedCount > 0) {
        // ── Phase 2 ────────────────────────────────────────────────────────
        // Dispatch concurrently OUTSIDE the lock tx. allSettled keeps one
        // failed send from cancelling the others.
        const dispatches = await Promise.allSettled(
          lockedMessages.map((m) => this.sendOnly(m)),
        );

        // ── Phase 3 ────────────────────────────────────────────────────────
        // Persist terminal state per message. Errors here are logged but do
        // not abort the loop — a single repo write failure must not strand
        // sibling messages.
        for (let i = 0; i < lockedMessages.length; i += 1) {
          const message = lockedMessages[i]!;
          const settled = dispatches[i]!;
          try {
            if (settled.status === 'fulfilled') {
              await this.recordOutcome(message, settled.value);
            } else {
              await this.recordOutcome(message, {
                kind: 'threw',
                error: settled.reason,
              });
            }
          } catch (err) {
            this.logger.error({
              msg: 'Failed to persist outbox terminal state',
              messageId: message.id,
              error: String(err),
            });
          }
        }
      }
    } catch (err) {
      this.logger.error({
        msg: 'Outbox processor batch error',
        error: String(err),
      });
    } finally {
      // Only reset the flag once Phases 1-3 are all done so the next tick
      // can't race a still-in-flight dispatch.
      this.processing = false;
    }

    if (processedCount > 0) {
      this.logger.log({ msg: 'Outbox batch processed', count: processedCount });
    }

    return processedCount;
  }

  /**
   * Phase 2 helper — invoke the SMS provider and normalise the outcome.
   * Never throws; thrown errors are captured into the `threw` branch so
   * Promise.allSettled fulfils for the caller.
   */
  private async sendOnly(message: {
    recipient_mobile: string;
    message_body: string;
  }): Promise<SendOutcome> {
    try {
      const result = await this.smsProvider.send(
        message.recipient_mobile,
        message.message_body,
      );
      if (result.success) {
        return { kind: 'sent', providerMessageId: result.messageId };
      }
      return { kind: 'failed', error: result.error ?? 'unknown error' };
    } catch (err) {
      return { kind: 'threw', error: err };
    }
  }

  /**
   * Phase 3 helper — translate a SendOutcome into the appropriate repository
   * call. Kept here so the surface area of dispatchMessage stays small.
   */
  private async recordOutcome(
    message: {
      id: string;
      retry_count: number;
      max_retries: number;
    },
    outcome: SendOutcome,
  ): Promise<void> {
    if (outcome.kind === 'sent') {
      await this.repository.markSent(message.id, {
        messageId: outcome.providerMessageId,
        sentAt: new Date().toISOString(),
      });
      this.logger.log({
        msg: 'SMS sent successfully',
        messageId: message.id,
        providerMessageId: outcome.providerMessageId,
      });
      return;
    }

    if (outcome.kind === 'failed') {
      await this.repository.markFailed(
        message.id,
        message.retry_count,
        message.max_retries,
        { error: outcome.error, attemptedAt: new Date().toISOString() },
      );
      this.logger.warn({
        msg: 'SMS dispatch failed',
        messageId: message.id,
        retryCount: message.retry_count + 1,
        maxRetries: message.max_retries,
        error: outcome.error,
      });
      return;
    }

    // threw
    await this.repository.markFailed(
      message.id,
      message.retry_count,
      message.max_retries,
      { error: String(outcome.error), attemptedAt: new Date().toISOString() },
    );
    this.logger.error({
      msg: 'SMS dispatch threw exception',
      messageId: message.id,
      retryCount: message.retry_count + 1,
      error: String(outcome.error),
    });
  }
}
