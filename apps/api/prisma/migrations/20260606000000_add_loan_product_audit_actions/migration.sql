-- Add loan_product_* values to AuditAction enum so loan-product mutations
-- can be recorded with semantically-correct action types (compliance queries
-- previously conflated product changes with customer/loan events).

ALTER TYPE "AuditAction" ADD VALUE 'loan_product_created';
ALTER TYPE "AuditAction" ADD VALUE 'loan_product_updated';
ALTER TYPE "AuditAction" ADD VALUE 'loan_product_deactivated';
