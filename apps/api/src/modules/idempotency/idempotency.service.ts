import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/** Shape returned by find() when a cached result exists. */
export interface IdempotencyResult {
  resultStatus: number;
  resultBody: unknown;
}

/** 24-hour TTL for idempotency keys. */
const KEY_TTL_MS = 24 * 60 * 60 * 1000;

/** Delay before retrying SELECT after a unique-constraint race. */
const RETRY_DELAY_MS = 100;

/**
 * Idempotency key service — prevents duplicate processing of finance-affecting
 * operations (disbursement, collection, reversal, penalty).
 *
 * Lifecycle:
 *  1. Caller invokes `find(key)` before starting the operation.
 *  2. If a cached result exists, the caller returns it immediately (no side effects).
 *  3. If not found, the caller executes the operation within a transaction and
 *     calls `store(key, …, tx)` inside the same transaction so the key is
 *     committed atomically with the finance mutation.
 *  4. On concurrent duplicate (unique constraint violation), the service waits
 *     briefly and retries the SELECT to return the cached result.
 *  5. A background cleanup job removes expired keys (24-hour TTL).
 *
 * Requirements: 20.1, 5.5, 6.4
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if an idempotency key already exists and return the cached result.
   *
   * Returns `null` when the key has not been stored yet.
   */
  async find(key: string): Promise<IdempotencyResult | null> {
    // Filter expired rows server-side so stale TTL'd keys never replay a cached body.
    const record = await this.prisma.idempotency_keys.findFirst({
      where: { key, expires_at: { gt: new Date() } },
    });

    if (!record) return null;

    return {
      resultStatus: record.result_status,
      resultBody: record.result_body,
    };
  }

  /**
   * Store an idempotency key with its result within a transaction.
   *
   * The key is inserted inside the caller's transaction so that if the
   * transaction rolls back, the key is also rolled back — no false positives.
   *
   * On concurrent duplicate (unique constraint violation on `key`), waits
   * 100 ms and retries a SELECT to return the already-committed result.
   */
  async store(
    key: string,
    operationType: string,
    resultStatus: number,
    resultBody: unknown,
    tx?: TxClient,
  ): Promise<IdempotencyResult> {
    const client = tx ?? this.prisma;
    const expiresAt = new Date(Date.now() + KEY_TTL_MS);

    try {
      await client.idempotency_keys.create({
        data: {
          key,
          operation_type: operationType,
          result_status: resultStatus,
          result_body: resultBody as Prisma.InputJsonValue,
          expires_at: expiresAt,
        },
      });

      return { resultStatus, resultBody };
    } catch (error: unknown) {
      // Prisma unique constraint violation code: P2002
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.warn({
          msg: 'Idempotency key conflict — concurrent duplicate detected',
          key,
          operationType,
        });

        // Inside a tx the conflict has already aborted the underlying Postgres
        // transaction; any further statement on `tx` fails, and a SELECT on
        // `this.prisma` would return a cached body while the caller's tx still
        // poisons on commit. Propagate so the outer tx rolls back cleanly and
        // the controller falls back to find() to return the cached body.
        if (tx) {
          throw error;
        }

        // Outside a tx: wait briefly for the competing writer to commit, then
        // return the already-committed cached result.
        await this.delay(RETRY_DELAY_MS);

        const existing = await this.prisma.idempotency_keys.findFirst({
          where: { key, expires_at: { gt: new Date() } },
        });

        if (existing) {
          return {
            resultStatus: existing.result_status,
            resultBody: existing.result_body,
          };
        }

        // If still not found (e.g. competing tx rolled back), re-throw
        throw error;
      }

      throw error;
    }
  }

  /**
   * Remove expired idempotency keys (24-hour TTL).
   *
   * Runs hourly via @nestjs/schedule so the table cannot grow unbounded —
   * without this the per-row TTL is dead weight.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.idempotency_keys.deleteMany({
      where: {
        expires_at: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log({
        msg: 'Expired idempotency keys cleaned up',
        count: result.count,
      });
    }

    return result.count;
  }

  /** Simple async delay helper. */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
