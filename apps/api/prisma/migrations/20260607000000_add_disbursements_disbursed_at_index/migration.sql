-- Disbursement report filters where disbursed_at BETWEEN startDate AND endDate
-- and orders by disbursed_at DESC. Without this index, the query performs a
-- full table scan + sort that scales poorly with disbursement volume.

CREATE INDEX "idx_disbursements_disbursed_at" ON "disbursements"("disbursed_at" DESC);
