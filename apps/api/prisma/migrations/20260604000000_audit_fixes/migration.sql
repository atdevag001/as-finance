-- Audit fixes migration: penalty_id on collection_allocations,
-- FK from password_history.user_id to users (cascade), last_interest_accrued_to on loans.

-- 1. collection_allocations.penalty_id (for accurate reversal targeting)
ALTER TABLE "collection_allocations" ADD COLUMN "penalty_id" UUID;
ALTER TABLE "collection_allocations"
  ADD CONSTRAINT "collection_allocations_penalty_id_fkey"
  FOREIGN KEY ("penalty_id") REFERENCES "penalties"("id") ON DELETE RESTRICT;
CREATE INDEX "idx_allocations_penalty_id" ON "collection_allocations"("penalty_id");

-- 2. password_history → users with cascade (orphans cleaned on user delete)
ALTER TABLE "password_history"
  ADD CONSTRAINT "password_history_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;

-- 3. loans.last_interest_accrued_to (for correct reducing-balance foreclosure math)
ALTER TABLE "loans" ADD COLUMN "last_interest_accrued_to" DATE;
