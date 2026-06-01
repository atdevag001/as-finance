-- Refresh token family columns for replay detection.
-- A "family" is a chain of rotated tokens; replay of any revoked token in
-- the family revokes the entire family.

ALTER TABLE "refresh_tokens" ADD COLUMN "family_id" UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE "refresh_tokens" ADD COLUMN "parent_id" UUID;
ALTER TABLE "refresh_tokens" ADD COLUMN "revoked_at" TIMESTAMPTZ;
ALTER TABLE "refresh_tokens" ADD COLUMN "revoked_reason" VARCHAR(50);

-- For pre-existing rows: family_id defaulted via gen_random_uuid() (one family per token)
-- parent_id stays NULL (treated as initial tokens; no replay history to migrate)

CREATE INDEX "idx_refresh_tokens_family" ON "refresh_tokens"("family_id");
