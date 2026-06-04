-- Add missing indexes on foreign key columns for query performance.
-- These columns are used in JOINs but lack indexes, causing sequential scans.

-- customer_documents
CREATE INDEX "idx_customer_documents_file_id" ON "customer_documents"("file_id");
CREATE INDEX "idx_customer_documents_verified_by" ON "customer_documents"("verified_by");

-- customers
CREATE INDEX "idx_customers_photo_file_id" ON "customers"("photo_file_id");

-- guarantors
CREATE INDEX "idx_guarantors_photo_file_id" ON "guarantors"("photo_file_id");

-- loan_products
CREATE INDEX "idx_loan_products_current_version_id" ON "loan_products"("current_version_id");

-- receipts
CREATE INDEX "idx_receipts_compensating_receipt_id" ON "receipts"("compensating_receipt_id");
CREATE INDEX "idx_receipts_original_receipt_id" ON "receipts"("original_receipt_id");
