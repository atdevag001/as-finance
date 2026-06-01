-- Sprint 4: Data integrity
-- - JE balance CHECK constraint (DB-level double-entry guarantee)
-- - accounting_periods table for period close
-- - Index for penalties (is_paid, is_waived) composite

-- JE balance CHECK — debits MUST equal credits and be positive
ALTER TABLE "journal_entries" ADD CONSTRAINT "je_balanced"
  CHECK ("total_debit_paise" = "total_credit_paise" AND "total_debit_paise" > 0);

-- Period close table
CREATE TABLE "accounting_periods" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "period" VARCHAR(7) NOT NULL,
  "closed_at" TIMESTAMPTZ NOT NULL,
  "closed_by" UUID NOT NULL,

  CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accounting_periods_period_key" ON "accounting_periods"("period");
CREATE INDEX "idx_accounting_periods_period" ON "accounting_periods"("period");

-- Composite index for unsettled-penalty lookups
CREATE INDEX "idx_penalties_unsettled" ON "penalties"("loan_id", "is_paid", "is_waived");
