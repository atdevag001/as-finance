-- Sprint 2: Critical correctness migrations
-- - Add unique constraint on disbursements.loan_id (prevents double-disburse race)
-- - Add version columns to collections, disbursements, penalties (optimistic locking)
-- - Add paid_paise column to penalties (fixes is_paid persistence bug)
-- - Add loans.created_at DESC index (pagination perf)

-- DropIndex (replaced by unique below)
DROP INDEX IF EXISTS "idx_disbursements_loan_id";

-- AlterTable: collections
ALTER TABLE "collections" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: disbursements
ALTER TABLE "disbursements" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable: penalties — paid_paise tracks payments toward the penalty
ALTER TABLE "penalties" ADD COLUMN "paid_paise" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "penalties" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "penalties" ADD CONSTRAINT "penalty_paid_le_amount"
  CHECK ("paid_paise" >= 0 AND "paid_paise" <= "amount_paise");

-- CreateIndex: disbursements unique on loan_id (prevents double-disburse)
CREATE UNIQUE INDEX "disbursements_loan_id_key" ON "disbursements"("loan_id");

-- CreateIndex: loans created_at for pagination
CREATE INDEX "idx_loans_created_at" ON "loans"("created_at" DESC);
