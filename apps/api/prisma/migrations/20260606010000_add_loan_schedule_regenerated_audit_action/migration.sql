-- Add 'loan_schedule_regenerated' to AuditAction so schedule regenerations are
-- distinguishable from approvals in the audit trail. Previously the
-- regenerateSchedule path reused 'loan_approved', which conflated two
-- materially different state changes for compliance / who-did-what queries.

ALTER TYPE "AuditAction" ADD VALUE 'loan_schedule_regenerated';
