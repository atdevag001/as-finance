-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'migration_started';
ALTER TYPE "AuditAction" ADD VALUE 'migration_completed';
ALTER TYPE "AuditAction" ADD VALUE 'migration_failed';

-- AlterTable
ALTER TABLE "collections" ADD COLUMN     "legacy_collection_id" VARCHAR(120);

-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "legacy_customer_id" VARCHAR(120);

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "legacy_group_id" VARCHAR(120);

-- AlterTable
ALTER TABLE "loans" ADD COLUMN     "legacy_loan_id" VARCHAR(120);

-- CreateIndex
CREATE INDEX "idx_collections_legacy_id" ON "collections"("legacy_collection_id");

-- CreateIndex
CREATE INDEX "idx_customers_legacy_id" ON "customers"("legacy_customer_id");

-- CreateIndex
CREATE INDEX "idx_groups_legacy_id" ON "groups"("legacy_group_id");

-- CreateIndex
CREATE INDEX "idx_loans_legacy_id" ON "loans"("legacy_loan_id");
