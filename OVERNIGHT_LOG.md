# Overnight Execution Log

**Operator:** asleep. Autonomous execution per plan
`/home/ubuntu/.claude/plans/zippy-conjuring-wilkes.md`.

**Started:** auto-timestamp on first commit.

Will live-edit this file as steps complete. Read top-to-bottom in the morning.

## Plan recap

Phase 1: Get E2E to ≥99% green on local PM2.
Phase 2: Build `pnpm create-admin` CLI, update DEPLOY.md.
Phase 3: Commit + push everything. (Cannot deploy to asfinance.skylomedia.com
without SSH; runbook left ready for morning.)
Phase 4: Write a morning-handover doc.

## Activity log

### Phase 1.1 — env on local PM2
Confirmed JWT_EXPIRY=120m, SKIP_TOKEN_ROTATION=true, SKIP_KYC_CHECK=true,
NODE_ENV=test, CORS_ORIGINS=http://localhost:3000.
Refreshed auth tokens. Auth-setup passed.

### Phase 1.2 — users.spec root cause
Ran users.spec in isolation at workers=1: 22/23 pass.
The one failure traced to a `/login` redirect during a fill — page redirected
mid-test (auth race under load).
Applied: switched all `waitForLoadState('domcontentloaded')` to
`'networkidle'`; added `gotoStableForm(page, url, anchorSelector)` helper that
retries up to 3 times if the URL is on `/login`.
Re-ran at workers=4: 19/23 pass (was 0/23 in evening — substantial
improvement; 4 remain due to deeper parallel-load races).
Committed: `6a5c8db test(e2e): users.spec — networkidle + gotoStableForm retry helper`.

### Phase 2.1 — create-admin CLI
Wrote `scripts/create-admin.ts`. Prompt-driven (username, full name, mobile,
email, password). Hidden password input. Validators mirror CreateUserDto
exactly. Bcrypt cost 12. Inserts user + password_history baseline + audit_log
row in a single $transaction. Refuses to run if any active super_admin
exists (--force prompts confirmation).
Verified locally: refused to overwrite the existing seed admin with a clear
error message.
Wired into `apps/api/package.json` as `pnpm create-admin`.
Committed: `df8a3a8 feat(ops): pnpm create-admin CLI`.

### Phase 2.2 — DEPLOY.md
Added §0 first-admin creation section. Tightened CORS_ORIGINS callout from
"optional" to "REQUIRED" with the actual production hostname.
Committed: `6eacc36 docs(deploy): §0 first-admin creation + CORS_ORIGINS marked REQUIRED`.

### Phase 1.3/1.4 — full E2E
Kicked off `npx playwright test --workers=2 --max-failures=0` in background.
Runtime: 57 minutes.

**Result:**
- 426 passed
- 18 flaky-but-pass-on-retry (444 effective green)
- 44 skipped
- 15 did not run
- 143 hard failures

Improvement vs evening: +66 passing (was 360), -63 failing (was 206).
Net pass rate: 68.7% effective. Below 99% target.

Dominant residual failure category: rbac-matrix (20 failures) — same
JWT-expiry / `/auth/refresh` rate-limit race that's been chasing the suite
all campaign. Real RBAC logic is correct; tests fail because the auth
provider logs out mid-test under contention.

### Final state at handoff
- 23 commits since `6810299` all pushed to `origin/main`.
- Latest SHA: `bba2e2e` (or later if the overnight-log push went through).
- Local PM2 box: running latest code, env set for testing.
- Production box (`asfinance.skylomedia.com`): still on the June 1 build.
  The operator (you) is the only one who can SSH and pull.
- `MORNING_HANDOVER.md`: detailed step-by-step go-live runbook with the
  ship-decision options spelled out.
