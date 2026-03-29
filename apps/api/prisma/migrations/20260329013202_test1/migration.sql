-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('super_admin', 'manager', 'field_officer', 'collection_officer', 'accountant', 'office_staff', 'viewer_auditor');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'active', 'overdue', 'defaulted', 'foreclosed', 'closed');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'blacklisted', 'inactive');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "InterestType" AS ENUM ('flat', 'reducing_balance');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('cash', 'bank_transfer', 'online');

-- CreateEnum
CREATE TYPE "CollectionStatus" AS ENUM ('posted', 'reversed');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('active', 'reversed');

-- CreateEnum
CREATE TYPE "InstallmentStatus" AS ENUM ('pending', 'partial', 'paid', 'overdue', 'closed');

-- CreateEnum
CREATE TYPE "OverdueBucket" AS ENUM ('bucket_0', 'bucket_1_30', 'bucket_31_60', 'bucket_61_90', 'bucket_90_plus');

-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('active', 'inactive', 'dissolved');

-- CreateEnum
CREATE TYPE "AccountCategory" AS ENUM ('asset', 'liability', 'income', 'expense', 'equity');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('disbursement', 'collection', 'reversal', 'penalty', 'expense', 'processing_fee', 'foreclosure');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('pending', 'processing', 'sent', 'failed', 'dead_letter');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('customer_created', 'customer_updated', 'customer_blacklisted', 'customer_reinstated', 'loan_created', 'loan_submitted', 'loan_reviewed', 'loan_approved', 'loan_rejected', 'loan_disbursed', 'loan_closed', 'loan_foreclosed', 'loan_overdue', 'loan_defaulted', 'collection_posted', 'collection_reversed', 'penalty_posted', 'penalty_waived', 'expense_recorded', 'login_success', 'login_failed', 'logout', 'account_locked', 'password_changed', 'user_created', 'user_role_changed', 'unauthorized_access', 'cash_handover', 'document_uploaded', 'document_deleted');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');

-- CreateEnum
CREATE TYPE "DocType" AS ENUM ('aadhaar_front', 'aadhaar_back', 'pan', 'photo', 'address_proof', 'other');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('fixed', 'percentage');

-- CreateEnum
CREATE TYPE "PenaltyType" AS ENUM ('flat_per_period', 'percentage_of_overdue');

-- CreateEnum
CREATE TYPE "ForeclosureStatus" AS ENUM ('quote', 'approved', 'settled', 'expired', 'cancelled');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('pending', 'verified', 'discrepancy');

-- CreateEnum
CREATE TYPE "CashTxType" AS ENUM ('inflow', 'outflow');

-- CreateEnum
CREATE TYPE "CashCategory" AS ENUM ('collection', 'disbursement', 'expense', 'handover_in', 'handover_out');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('submitted', 'under_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "NotificationEvent" AS ENUM ('loan_approved', 'loan_rejected', 'disbursed', 'collection_receipt', 'emi_reminder', 'overdue_reminder', 'penalty_notice', 'daily_collection_summary');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(200),
    "mobile" VARCHAR(15) NOT NULL,
    "role" "UserRole" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ,
    "last_login_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "is_revoked" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_area_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "area_name" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "assigned_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_area_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "full_name" VARCHAR(200) NOT NULL,
    "father_or_husband_name" VARCHAR(200),
    "mobile" VARCHAR(15) NOT NULL,
    "alternate_mobile" VARCHAR(15),
    "aadhaar_number_encrypted" VARCHAR(500) NOT NULL,
    "aadhaar_last_four" CHAR(4) NOT NULL,
    "pan_number_encrypted" VARCHAR(500),
    "pan_last_four" CHAR(4),
    "dob" DATE,
    "age" INTEGER,
    "gender" VARCHAR(10) NOT NULL,
    "occupation" VARCHAR(200),
    "monthly_income_paise" BIGINT,
    "work_or_business_details" TEXT,
    "address_line1" VARCHAR(500) NOT NULL,
    "address_line2" VARCHAR(500),
    "city" VARCHAR(100) NOT NULL,
    "district" VARCHAR(100) NOT NULL,
    "state" VARCHAR(100) NOT NULL,
    "pincode" CHAR(6) NOT NULL,
    "risk_level" "RiskLevel" NOT NULL DEFAULT 'medium',
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "blacklist_reason" TEXT,
    "blacklisted_at" TIMESTAMPTZ,
    "blacklisted_by" UUID,
    "assigned_officer_id" UUID,
    "photo_file_id" UUID,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "document_type" "DocType" NOT NULL,
    "file_id" UUID NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "family_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "relationship" VARCHAR(50) NOT NULL,
    "contact_number" VARCHAR(15),
    "occupation" VARCHAR(200),
    "income_contribution" VARCHAR(200),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guarantors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "relationship" VARCHAR(50) NOT NULL,
    "mobile" VARCHAR(15) NOT NULL,
    "aadhaar_number_encrypted" VARCHAR(500) NOT NULL,
    "aadhaar_last_four" CHAR(4) NOT NULL,
    "address" TEXT NOT NULL,
    "photo_file_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guarantors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_version_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "loan_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_product_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "interest_type" "InterestType" NOT NULL,
    "annual_rate_bps" INTEGER NOT NULL,
    "min_principal_paise" BIGINT NOT NULL,
    "max_principal_paise" BIGINT NOT NULL,
    "min_tenure_months" INTEGER NOT NULL,
    "max_tenure_months" INTEGER NOT NULL,
    "repayment_frequency" "Frequency" NOT NULL,
    "processing_fee_type" "FeeType",
    "processing_fee_value" INTEGER,
    "penalty_grace_days" INTEGER NOT NULL DEFAULT 0,
    "penalty_type" "PenaltyType",
    "penalty_value" INTEGER,
    "penalty_frequency" "Frequency",
    "max_concurrent_loans" INTEGER NOT NULL DEFAULT 1,
    "allocation_order" JSONB NOT NULL DEFAULT '["penalty","interest","principal"]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_number" VARCHAR(50) NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_version_id" UUID NOT NULL,
    "group_id" UUID,
    "principal_paise" BIGINT NOT NULL,
    "tenure_months" INTEGER NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'draft',
    "processing_fee_paise" BIGINT,
    "total_interest_paise" BIGINT,
    "total_payable_paise" BIGINT,
    "cached_outstanding_paise" BIGINT,
    "disbursement_date" DATE,
    "first_due_date" DATE,
    "last_due_date" DATE,
    "dpd" INTEGER NOT NULL DEFAULT 0,
    "overdue_bucket" "OverdueBucket",
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "action" "ApprovalAction" NOT NULL,
    "actor_id" UUID NOT NULL,
    "remarks" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "from_status" "LoanStatus",
    "to_status" "LoanStatus" NOT NULL,
    "changed_by" UUID NOT NULL,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "installment_number" INTEGER NOT NULL,
    "due_date" DATE NOT NULL,
    "principal_paise" BIGINT NOT NULL,
    "interest_paise" BIGINT NOT NULL,
    "total_paise" BIGINT NOT NULL,
    "principal_paid_paise" BIGINT NOT NULL DEFAULT 0,
    "interest_paid_paise" BIGINT NOT NULL DEFAULT 0,
    "penalty_paid_paise" BIGINT NOT NULL DEFAULT 0,
    "status" "InstallmentStatus" NOT NULL DEFAULT 'pending',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "loan_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "reference_number" VARCHAR(100),
    "disbursed_by" UUID NOT NULL,
    "disbursed_at" TIMESTAMPTZ NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "status" "CollectionStatus" NOT NULL DEFAULT 'posted',
    "is_reversal" BOOLEAN NOT NULL DEFAULT false,
    "original_collection_id" UUID,
    "reversal_reason" TEXT,
    "collected_by" UUID NOT NULL,
    "journal_entry_id" UUID NOT NULL,
    "receipt_id" UUID,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "penalty_paise" BIGINT NOT NULL DEFAULT 0,
    "interest_paise" BIGINT NOT NULL DEFAULT 0,
    "principal_paise" BIGINT NOT NULL DEFAULT 0,
    "total_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_number" VARCHAR(50) NOT NULL,
    "collection_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "payment_date" DATE NOT NULL,
    "payment_mode" "PaymentMode" NOT NULL,
    "penalty_component_paise" BIGINT NOT NULL DEFAULT 0,
    "interest_component_paise" BIGINT NOT NULL DEFAULT 0,
    "principal_component_paise" BIGINT NOT NULL DEFAULT 0,
    "outstanding_after_paise" BIGINT NOT NULL,
    "officer_name" VARCHAR(200) NOT NULL,
    "customer_name" VARCHAR(200) NOT NULL,
    "loan_number" VARCHAR(50) NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'active',
    "compensating_receipt_id" UUID,
    "is_reversal" BOOLEAN NOT NULL DEFAULT false,
    "original_receipt_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "penalties" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "penalty_period" VARCHAR(20) NOT NULL,
    "calculation_details" JSONB NOT NULL,
    "is_paid" BOOLEAN NOT NULL DEFAULT false,
    "is_waived" BOOLEAN NOT NULL DEFAULT false,
    "waived_by" UUID,
    "waiver_approved_by" UUID,
    "waived_reason" TEXT,
    "journal_entry_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "foreclosures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "outstanding_principal_paise" BIGINT NOT NULL,
    "accrued_interest_paise" BIGINT NOT NULL,
    "pending_penalties_paise" BIGINT NOT NULL,
    "rebate_paise" BIGINT NOT NULL DEFAULT 0,
    "settlement_amount_paise" BIGINT NOT NULL,
    "rebate_reason" TEXT,
    "rebate_authorized_by" UUID,
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "collection_id" UUID,
    "status" "ForeclosureStatus" NOT NULL DEFAULT 'quote',
    "quote_expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settled_at" TIMESTAMPTZ,

    CONSTRAINT "foreclosures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "overdue_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "loan_id" UUID NOT NULL,
    "installment_id" UUID,
    "recorded_date" DATE NOT NULL,
    "dpd" INTEGER NOT NULL,
    "overdue_bucket" "OverdueBucket" NOT NULL,
    "overdue_principal_paise" BIGINT NOT NULL,
    "overdue_interest_paise" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "overdue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "meeting_day" "DayOfWeek" NOT NULL,
    "branch_area" VARCHAR(200) NOT NULL,
    "leader_id" UUID NOT NULL,
    "status" "GroupStatus" NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "group_id" UUID NOT NULL,
    "total_amount_paise" BIGINT NOT NULL,
    "collection_date" DATE NOT NULL,
    "collected_by" UUID NOT NULL,
    "idempotency_key" VARCHAR(255) NOT NULL,
    "member_breakdown" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chart_of_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" "AccountCategory" NOT NULL,
    "parent_id" UUID,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chart_of_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entry_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "source_type" "JournalSourceType" NOT NULL,
    "source_id" UUID NOT NULL,
    "total_debit_paise" BIGINT NOT NULL,
    "total_credit_paise" BIGINT NOT NULL,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "journal_entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit_paise" BIGINT NOT NULL DEFAULT 0,
    "credit_paise" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transaction_date" DATE NOT NULL,
    "type" "CashTxType" NOT NULL,
    "category" "CashCategory" NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "description" TEXT NOT NULL,
    "source_type" VARCHAR(50),
    "source_id" UUID,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_handover_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "collection_officer_id" UUID NOT NULL,
    "receiving_officer_id" UUID NOT NULL,
    "handover_date" DATE NOT NULL,
    "total_amount_paise" BIGINT NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'pending',
    "discrepancy_amount_paise" BIGINT,
    "discrepancy_notes" TEXT,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_handover_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category" VARCHAR(100) NOT NULL,
    "amount_paise" BIGINT NOT NULL,
    "expense_date" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "document_file_id" UUID,
    "journal_entry_id" UUID NOT NULL,
    "recorded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_type" "NotificationEvent" NOT NULL,
    "recipient_mobile" VARCHAR(15) NOT NULL,
    "template_id" UUID,
    "message_body" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'pending',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "next_retry_at" TIMESTAMPTZ,
    "provider_response" JSONB,
    "source_type" VARCHAR(50) NOT NULL,
    "source_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ,

    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_type" "NotificationEvent" NOT NULL,
    "language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "template_body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sms_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action_type" "AuditAction" NOT NULL,
    "actor_id" UUID NOT NULL,
    "actor_role" "UserRole" NOT NULL,
    "target_entity" VARCHAR(50) NOT NULL,
    "target_id" UUID NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "request_id" UUID NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "remarks" TEXT,
    "approval_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "key" VARCHAR(255) NOT NULL,
    "operation_type" VARCHAR(50) NOT NULL,
    "result_status" INTEGER NOT NULL,
    "result_body" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_metadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "original_filename" VARCHAR(500) NOT NULL,
    "stored_filename" VARCHAR(500) NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "bucket" VARCHAR(100) NOT NULL,
    "key" VARCHAR(500) NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_mobile_key" ON "users"("mobile");

-- CreateIndex
CREATE INDEX "idx_users_role" ON "users"("role");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "idx_user_area_user_id" ON "user_area_assignments"("user_id");

-- CreateIndex
CREATE INDEX "idx_user_area_area_name" ON "user_area_assignments"("area_name");

-- CreateIndex
CREATE INDEX "idx_customers_aadhaar_last_four" ON "customers"("aadhaar_last_four");

-- CreateIndex
CREATE INDEX "idx_customers_mobile" ON "customers"("mobile");

-- CreateIndex
CREATE INDEX "idx_customers_status" ON "customers"("status");

-- CreateIndex
CREATE INDEX "idx_customers_assigned_officer" ON "customers"("assigned_officer_id");

-- CreateIndex
CREATE INDEX "idx_customers_created_by" ON "customers"("created_by");

-- CreateIndex
CREATE INDEX "idx_customer_documents_customer_id" ON "customer_documents"("customer_id");

-- CreateIndex
CREATE INDEX "idx_customer_documents_type" ON "customer_documents"("document_type");

-- CreateIndex
CREATE INDEX "idx_family_members_customer_id" ON "family_members"("customer_id");

-- CreateIndex
CREATE INDEX "idx_guarantors_customer_id" ON "guarantors"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_products_name_key" ON "loan_products"("name");

-- CreateIndex
CREATE INDEX "idx_loan_products_name" ON "loan_products"("name");

-- CreateIndex
CREATE INDEX "idx_loan_products_is_active" ON "loan_products"("is_active");

-- CreateIndex
CREATE INDEX "idx_lpv_product_id" ON "loan_product_versions"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_product_versions_product_id_version_number_key" ON "loan_product_versions"("product_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "loans_loan_number_key" ON "loans"("loan_number");

-- CreateIndex
CREATE INDEX "idx_loans_customer_id" ON "loans"("customer_id");

-- CreateIndex
CREATE INDEX "idx_loans_status" ON "loans"("status");

-- CreateIndex
CREATE INDEX "idx_loans_group_id" ON "loans"("group_id");

-- CreateIndex
CREATE INDEX "idx_loans_product_version_id" ON "loans"("product_version_id");

-- CreateIndex
CREATE INDEX "idx_loans_created_by" ON "loans"("created_by");

-- CreateIndex
CREATE INDEX "idx_loans_dpd" ON "loans"("dpd");

-- CreateIndex
CREATE INDEX "idx_loans_overdue_bucket" ON "loans"("overdue_bucket");

-- CreateIndex
CREATE INDEX "idx_loan_approvals_loan_id" ON "loan_approvals"("loan_id");

-- CreateIndex
CREATE INDEX "idx_loan_approvals_actor_id" ON "loan_approvals"("actor_id");

-- CreateIndex
CREATE INDEX "idx_loan_status_history_loan_id" ON "loan_status_history"("loan_id");

-- CreateIndex
CREATE INDEX "idx_loan_status_history_to_status" ON "loan_status_history"("to_status");

-- CreateIndex
CREATE INDEX "idx_loan_status_history_created_at" ON "loan_status_history"("created_at");

-- CreateIndex
CREATE INDEX "idx_schedules_loan_id" ON "loan_schedules"("loan_id");

-- CreateIndex
CREATE INDEX "idx_schedules_due_date" ON "loan_schedules"("due_date");

-- CreateIndex
CREATE INDEX "idx_schedules_status" ON "loan_schedules"("status");

-- CreateIndex
CREATE UNIQUE INDEX "loan_schedules_loan_id_installment_number_key" ON "loan_schedules"("loan_id", "installment_number");

-- CreateIndex
CREATE UNIQUE INDEX "disbursements_idempotency_key_key" ON "disbursements"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_disbursements_loan_id" ON "disbursements"("loan_id");

-- CreateIndex
CREATE UNIQUE INDEX "collections_idempotency_key_key" ON "collections"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_collections_loan_id" ON "collections"("loan_id");

-- CreateIndex
CREATE INDEX "idx_collections_payment_date" ON "collections"("payment_date");

-- CreateIndex
CREATE INDEX "idx_collections_status" ON "collections"("status");

-- CreateIndex
CREATE INDEX "idx_collections_original_collection_id" ON "collections"("original_collection_id");

-- CreateIndex
CREATE INDEX "idx_allocations_collection_id" ON "collection_allocations"("collection_id");

-- CreateIndex
CREATE INDEX "idx_allocations_installment_id" ON "collection_allocations"("installment_id");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_receipt_number_key" ON "receipts"("receipt_number");

-- CreateIndex
CREATE INDEX "idx_receipts_collection_id" ON "receipts"("collection_id");

-- CreateIndex
CREATE INDEX "idx_receipts_loan_id" ON "receipts"("loan_id");

-- CreateIndex
CREATE INDEX "idx_receipts_customer_id" ON "receipts"("customer_id");

-- CreateIndex
CREATE INDEX "idx_receipts_payment_date" ON "receipts"("payment_date");

-- CreateIndex
CREATE INDEX "idx_penalties_loan_id" ON "penalties"("loan_id");

-- CreateIndex
CREATE INDEX "idx_penalties_installment_id" ON "penalties"("installment_id");

-- CreateIndex
CREATE UNIQUE INDEX "penalties_loan_id_installment_id_penalty_period_key" ON "penalties"("loan_id", "installment_id", "penalty_period");

-- CreateIndex
CREATE INDEX "idx_foreclosures_loan_id" ON "foreclosures"("loan_id");

-- CreateIndex
CREATE INDEX "idx_foreclosures_status" ON "foreclosures"("status");

-- CreateIndex
CREATE INDEX "idx_overdue_entries_loan_id" ON "overdue_entries"("loan_id");

-- CreateIndex
CREATE INDEX "idx_overdue_entries_date" ON "overdue_entries"("recorded_date");

-- CreateIndex
CREATE INDEX "idx_overdue_entries_bucket" ON "overdue_entries"("overdue_bucket");

-- CreateIndex
CREATE INDEX "idx_groups_status" ON "groups"("status");

-- CreateIndex
CREATE INDEX "idx_groups_leader_id" ON "groups"("leader_id");

-- CreateIndex
CREATE INDEX "idx_groups_branch_area" ON "groups"("branch_area");

-- CreateIndex
CREATE INDEX "idx_group_members_group_id" ON "group_members"("group_id");

-- CreateIndex
CREATE INDEX "idx_group_members_customer_id" ON "group_members"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_collections_idempotency_key_key" ON "group_collections"("idempotency_key");

-- CreateIndex
CREATE INDEX "idx_group_collections_group_id" ON "group_collections"("group_id");

-- CreateIndex
CREATE INDEX "idx_group_collections_date" ON "group_collections"("collection_date");

-- CreateIndex
CREATE UNIQUE INDEX "chart_of_accounts_code_key" ON "chart_of_accounts"("code");

-- CreateIndex
CREATE INDEX "idx_coa_category" ON "chart_of_accounts"("category");

-- CreateIndex
CREATE INDEX "idx_coa_parent_id" ON "chart_of_accounts"("parent_id");

-- CreateIndex
CREATE INDEX "idx_je_entry_date" ON "journal_entries"("entry_date");

-- CreateIndex
CREATE INDEX "idx_je_source" ON "journal_entries"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "idx_je_source_type" ON "journal_entries"("source_type");

-- CreateIndex
CREATE INDEX "idx_jl_journal_entry_id" ON "journal_lines"("journal_entry_id");

-- CreateIndex
CREATE INDEX "idx_jl_account_id" ON "journal_lines"("account_id");

-- CreateIndex
CREATE INDEX "idx_cash_tx_date" ON "cash_transactions"("transaction_date");

-- CreateIndex
CREATE INDEX "idx_cash_tx_type" ON "cash_transactions"("type");

-- CreateIndex
CREATE INDEX "idx_cash_tx_category" ON "cash_transactions"("category");

-- CreateIndex
CREATE INDEX "idx_handover_officer" ON "cash_handover_records"("collection_officer_id");

-- CreateIndex
CREATE INDEX "idx_handover_date" ON "cash_handover_records"("handover_date");

-- CreateIndex
CREATE INDEX "idx_handover_status" ON "cash_handover_records"("verification_status");

-- CreateIndex
CREATE INDEX "idx_expenses_date" ON "expenses"("expense_date");

-- CreateIndex
CREATE INDEX "idx_expenses_category" ON "expenses"("category");

-- CreateIndex
CREATE INDEX "idx_outbox_status" ON "outbox_messages"("status");

-- CreateIndex
CREATE INDEX "idx_outbox_next_retry" ON "outbox_messages"("next_retry_at");

-- CreateIndex
CREATE INDEX "idx_outbox_source" ON "outbox_messages"("source_type", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_templates_event_type_language_key" ON "sms_templates"("event_type", "language");

-- CreateIndex
CREATE INDEX "idx_audit_target" ON "audit_logs"("target_entity", "target_id");

-- CreateIndex
CREATE INDEX "idx_audit_actor" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "idx_audit_action_type" ON "audit_logs"("action_type");

-- CreateIndex
CREATE INDEX "idx_audit_created_at" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_audit_request_id" ON "audit_logs"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_key_key" ON "idempotency_keys"("key");

-- CreateIndex
CREATE INDEX "idx_idempotency_expires" ON "idempotency_keys"("expires_at");

-- CreateIndex
CREATE INDEX "idx_file_metadata_key" ON "file_metadata"("key");

-- CreateIndex
CREATE INDEX "idx_file_metadata_uploaded_by" ON "file_metadata"("uploaded_by");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_area_assignments" ADD CONSTRAINT "user_area_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_area_assignments" ADD CONSTRAINT "user_area_assignments_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_officer_id_fkey" FOREIGN KEY ("assigned_officer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_blacklisted_by_fkey" FOREIGN KEY ("blacklisted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "file_metadata"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_documents" ADD CONSTRAINT "customer_documents_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guarantors" ADD CONSTRAINT "guarantors_photo_file_id_fkey" FOREIGN KEY ("photo_file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_products" ADD CONSTRAINT "loan_products_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_products" ADD CONSTRAINT "loan_products_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "loan_product_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_product_versions" ADD CONSTRAINT "loan_product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "loan_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_product_version_id_fkey" FOREIGN KEY ("product_version_id") REFERENCES "loan_product_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_approvals" ADD CONSTRAINT "loan_approvals_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_approvals" ADD CONSTRAINT "loan_approvals_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_status_history" ADD CONSTRAINT "loan_status_history_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_status_history" ADD CONSTRAINT "loan_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_schedules" ADD CONSTRAINT "loan_schedules_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_disbursed_by_fkey" FOREIGN KEY ("disbursed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collections" ADD CONSTRAINT "collections_original_collection_id_fkey" FOREIGN KEY ("original_collection_id") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_allocations" ADD CONSTRAINT "collection_allocations_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_allocations" ADD CONSTRAINT "collection_allocations_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "loan_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_compensating_receipt_id_fkey" FOREIGN KEY ("compensating_receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_original_receipt_id_fkey" FOREIGN KEY ("original_receipt_id") REFERENCES "receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "loan_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_waived_by_fkey" FOREIGN KEY ("waived_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_waiver_approved_by_fkey" FOREIGN KEY ("waiver_approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreclosures" ADD CONSTRAINT "foreclosures_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreclosures" ADD CONSTRAINT "foreclosures_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreclosures" ADD CONSTRAINT "foreclosures_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreclosures" ADD CONSTRAINT "foreclosures_rebate_authorized_by_fkey" FOREIGN KEY ("rebate_authorized_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "foreclosures" ADD CONSTRAINT "foreclosures_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overdue_entries" ADD CONSTRAINT "overdue_entries_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "overdue_entries" ADD CONSTRAINT "overdue_entries_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "loan_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_collections" ADD CONSTRAINT "group_collections_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_collections" ADD CONSTRAINT "group_collections_collected_by_fkey" FOREIGN KEY ("collected_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chart_of_accounts" ADD CONSTRAINT "chart_of_accounts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transactions" ADD CONSTRAINT "cash_transactions_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_handover_records" ADD CONSTRAINT "cash_handover_records_collection_officer_id_fkey" FOREIGN KEY ("collection_officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_handover_records" ADD CONSTRAINT "cash_handover_records_receiving_officer_id_fkey" FOREIGN KEY ("receiving_officer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_document_file_id_fkey" FOREIGN KEY ("document_file_id") REFERENCES "file_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "sms_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settings" ADD CONSTRAINT "settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_metadata" ADD CONSTRAINT "file_metadata_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
