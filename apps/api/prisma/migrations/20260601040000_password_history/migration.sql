-- Password history for re-use prevention.
-- changePassword bcrypt-compares the new candidate against the last
-- PASSWORD_HISTORY_DEPTH entries and rejects matches.

CREATE TABLE "password_history" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"       UUID NOT NULL,
  "password_hash" VARCHAR(255) NOT NULL,
  "created_at"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_password_history_user" ON "password_history"("user_id", "created_at" DESC);
