-- Outbox processor's fetchProcessableBatch polls with:
--   WHERE (status='pending'
--       OR (status='failed'     AND next_retry_at <= NOW())
--       OR (status='processing' AND next_retry_at <= NOW()))
--     AND retry_count < max_retries
--   ORDER BY created_at ASC
--   FOR UPDATE SKIP LOCKED
--
-- The independent single-column indexes on status and next_retry_at cannot
-- satisfy this OR-of-AND predicate efficiently — Postgres falls back to a
-- sequential scan + sort as the table grows. A partial composite index over
-- the eligible statuses, sorted on (next_retry_at, created_at), lets the
-- planner use it for both the predicate and the ORDER BY.
--
-- Prisma does not support partial indexes declaratively, so this is emitted
-- as a raw SQL migration. The schema model carries a comment pointing here.

CREATE INDEX "idx_outbox_poll"
  ON "outbox_messages" ("next_retry_at", "created_at")
  WHERE status IN ('pending', 'failed', 'processing');
