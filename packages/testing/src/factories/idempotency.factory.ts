import { buildEntity, randomUUID } from './helpers.js';

/**
 * IdempotencyRecord — represents a stored idempotency key.
 * Maps to `idempotency_keys` Prisma model fields.
 */
export interface IdempotencyRecord {
  id: string;
  key: string;
  operationType: string;
  resultStatus: number;
  resultBody: Record<string, unknown>;
  createdAt: Date;
  expiresAt: Date;
}

export function buildIdempotencyRecord(
  overrides?: Partial<IdempotencyRecord>,
): IdempotencyRecord {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +24h

  return buildEntity<IdempotencyRecord>(
    {
      id: randomUUID(),
      key: randomUUID(),
      operationType: 'collection',
      resultStatus: 201,
      resultBody: { id: randomUUID(), status: 'posted' },
      createdAt: now,
      expiresAt,
    },
    overrides,
  );
}
