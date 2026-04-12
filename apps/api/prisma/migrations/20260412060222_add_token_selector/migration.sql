/*
  This migration adds a token_selector column for O(1) refresh token lookup.

  The token_selector stores the first 32 hex characters (16 bytes) of the refresh token
  for indexed lookup, while the remaining portion is hashed with bcrypt for verification.

  Existing refresh tokens are deleted since they don't have selectors.
  Users will need to re-login after this migration.
*/

-- Delete existing refresh tokens (they lack selectors and will be regenerated on login)
DELETE FROM "refresh_tokens";

-- DropIndex
DROP INDEX "idx_refresh_tokens_token_hash";

-- AlterTable
ALTER TABLE "refresh_tokens" ADD COLUMN     "token_selector" VARCHAR(32) NOT NULL;

-- CreateIndex
CREATE INDEX "idx_refresh_tokens_selector" ON "refresh_tokens"("token_selector");
