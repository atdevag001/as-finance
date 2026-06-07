-- Add cash_handover_verified to AuditAction so the cashbook service can write
-- an audit log for handover verification (the create flow uses cash_handover;
-- this is the verify counterpart). Without it, every PATCH /cashbook/handovers/:id/verify
-- 500s with "Invalid value for argument action_type. Expected AuditAction."

ALTER TYPE "AuditAction" ADD VALUE 'cash_handover_verified';
