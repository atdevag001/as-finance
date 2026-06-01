-- Add token_version column for JWT invalidation on password change.
-- JwtAuthGuard rejects tokens whose tv claim differs from current users.token_version.
ALTER TABLE "users" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 1;
