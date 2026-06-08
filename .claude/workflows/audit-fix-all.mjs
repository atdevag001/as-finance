export const meta = {
  name: 'audit-fix-all',
  description: 'Implement audit findings: auth, business logic, DTOs, frontend, then verify and fix tests',
  phases: [
    { title: 'Modules' },
    { title: 'Cross-module' },
    { title: 'Frontend' },
    { title: 'Verify' },
    { title: 'Fix tests' },
  ],
}

const CWD = '/home/ubuntu/Development/As_finance'

// Foundation already done in main thread:
//  - Pre-created: apps/api/src/common/utils/filename.util.ts (sanitizeFilenameForHeader, buildContentDisposition)
//  - Pre-created: apps/api/src/common/utils/common-passwords.ts (isCommonPassword)
//  - Updated: apps/api/src/common/utils/date.util.ts (added calendarDaysDiff, todayISTDate)
//  - Updated: packages/shared/src/utils/money.ts (added bigIntToDecimal)
//  - Updated: packages/shared/src/utils/index.ts (re-exports bigIntToDecimal)
//  - Pre-created: apps/web/src/lib/jwt.ts (decodeJwtPayload — URL-safe + UTF-8 capable)
//  - Schema: collection_allocations.penalty_id, password_history → users cascade, loans.last_interest_accrued_to
//  - Migration: apps/api/prisma/migrations/20260604000000_audit_fixes/migration.sql
//  - Prisma client regenerated.

phase('Modules')

const authPrompt = [
  'Fix authentication, RBAC, throttling, CSRF wiring in ' + CWD + '.',
  '',
  'FILES YOU OWN (read each first; edit as needed):',
  '  - apps/api/src/app.module.ts',
  '  - apps/api/src/modules/auth/auth.controller.ts',
  '  - apps/api/src/modules/auth/auth.service.ts',
  '  - apps/api/src/modules/auth/dto/login.dto.ts',
  '  - apps/api/src/modules/auth/dto/change-password.dto.ts',
  '  - apps/api/src/common/guards/jwt-auth.guard.ts',
  '  - apps/api/src/common/guards/csrf.guard.ts (read; may already be correct)',
  '  - apps/api/src/common/guards/throttler.guard.ts (read; may need updates)',
  '',
  'DO NOT TOUCH any other module files (other agents own those).',
  '',
  'CONTEXT — pre-created utilities exist:',
  '  - apps/api/src/common/utils/common-passwords.ts exports isCommonPassword(password: string): boolean',
  '',
  'FIXES:',
  '',
  '(H1) Register CsrfGuard globally in app.module.ts. Import CsrfGuard from ./common/guards/csrf.guard and add { provide: APP_GUARD, useClass: CsrfGuard } to providers AFTER the JwtAuthGuard entry.',
  '',
  '(H2) Per-user throttling broken — In app.module.ts, swap so JwtAuthGuard registers BEFORE CustomThrottlerGuard. APP_GUARDs execute in registration order; the throttler must see req.user populated.',
  '  Then verify throttler.guard.ts uses req.user.userId as tracker key when present, with req.ip as fallback. Fix if needed.',
  '  Also add named throttle entries in ThrottlerModule.forRoot: a "refresh" config (ttl 60000 ms, limit 10, test-mode limit 1000) and a "changePassword" config (ttl 60000 ms, limit 5, test-mode limit 1000).',
  '',
  '(H3) Throttle refresh + change-password — In auth.controller.ts apply @Throttle decorators to the refresh handler ({ refresh: { ttl: 60000, limit: 10 } }) and change-password handler ({ changePassword: { ttl: 60000, limit: 5 } }).',
  '',
  '(M1) Dummy bcrypt on unknown user — In auth.service.ts login flow, when user is missing or inactive, perform a dummy bcrypt.compare against a fixed hash constant before returning INVALID_CREDENTIALS, to equalize timing. Define a DECOY_HASH constant at top of file (any valid bcrypt $2a$12$ hash). Also do NOT expose ACCOUNT_LOCKED to the public response — return the same generic INVALID_CREDENTIALS message. Internal logging may still record lock state.',
  '',
  '(M2) Strict tv check — In jwt-auth.guard.ts, change the token-version check to fail-closed: missing or non-numeric tv must be rejected (throw UnauthorizedException with code TOKEN_REVOKED).',
  '',
  '(M3) MaxLength on password fields — In both login.dto.ts and change-password.dto.ts add @MaxLength(128) to all password fields. Add @MaxLength(100) to login.dto.ts username field.',
  '',
  '(M4) Real IP + request_id in audit logs — auth.service.ts currently hardcodes ip_address: "0.0.0.0" and request_id zero-UUID. Thread a context object { ipAddress: string; requestId: string } through public service methods (login, refresh, changePassword). Controllers pass req.ip and the request id from the request-id middleware (likely req["requestId"] or similar — grep the middleware file). Update auth.controller.ts handlers accordingly.',
  '',
  '(M5) Common-password blocklist — In auth.service.ts changePassword flow, import { isCommonPassword } from ../../common/utils/common-passwords. After the complexity check, if isCommonPassword(dto.newPassword) throw BadRequestException with code COMMON_PASSWORD.',
  '',
  '(M24) USER_CACHE TTL — In jwt-auth.guard.ts reduce the cache TTL constant from 60000 to 5000 ms.',
  '',
  'After all edits, grep to ensure no broken imports/identifiers. Report changes mapped to audit IDs.',
].join('\n')

const dtosPrompt = [
  'Harden DTOs across user/document/report/settings/query layers in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/user/user.controller.ts',
  '  - apps/api/src/modules/user/dto/* (read existing; CREATE new files as needed)',
  '  - apps/api/src/modules/document/document.controller.ts',
  '  - apps/api/src/modules/report/report.controller.ts',
  '  - apps/api/src/modules/report/dto/* (CREATE new files)',
  '  - apps/api/src/modules/settings/dto/update-setting.dto.ts',
  '  - apps/api/src/modules/settings/settings.controller.ts (shallow updates OK)',
  '  - apps/api/src/modules/loan/dto/loan-query.dto.ts',
  '  - apps/api/src/modules/customer/dto/customer-query.dto.ts',
  '  - apps/api/src/modules/foreclosure/dto/execute-foreclosure.dto.ts (comment only — DO NOT touch the service)',
  '',
  'DO NOT TOUCH auth/* (other agent), or any service .ts files outside what is strictly necessary to wire up new DTOs.',
  '',
  'CONTEXT — pre-created utility exists:',
  '  - apps/api/src/common/utils/filename.util.ts exports buildContentDisposition(disposition, rawFilename) — use this for the Content-Disposition header.',
  '',
  'FIXES:',
  '',
  '(H8) Multer limits on document upload — In document.controller.ts find the FileInterceptor("file") usage. Replace its options with: limits.fileSize = 5 MB (5 * 1024 * 1024), limits.files = 1, fileFilter that allows ONLY [image/jpeg, image/jpg, image/png, application/pdf] mimetypes (reject others with cb(new Error("INVALID_MIME_TYPE"), false)).',
  '',
  '(H9) Content-Disposition filename injection — In document.controller.ts download handler that sets Content-Disposition with raw original_filename, import buildContentDisposition from ../../common/utils/filename.util and use it: res.setHeader("Content-Disposition", buildContentDisposition("inline", metadata.original_filename)).',
  '',
  '(H10a) User /area-assignments DTO — In user.controller.ts the endpoint takes @Body("areaName") areaName: string. CREATE apps/api/src/modules/user/dto/area-assignment.dto.ts exporting AddAreaAssignmentDto with: areaName field decorated @IsString @IsNotEmpty @MaxLength(100) @Matches alphanumerics+spaces+commas+dots+hyphens regex. Update controller to use @Body() dto: AddAreaAssignmentDto and pass dto.areaName through.',
  '',
  '(H10b) User list query DTO — CREATE apps/api/src/modules/user/dto/user-query.dto.ts exporting UserQueryDto with optional fields: skip (IsInt Min 0, Type Number), take (IsInt Min 1 Max 100, Type Number), role (IsEnum of the 7 UserRole values), search (IsString MaxLength 100). Update GET /users handler in user.controller.ts to use @Query() query: UserQueryDto.',
  '',
  '(H10c) Report query DTO — CREATE apps/api/src/modules/report/dto/report-query.dto.ts exporting ReportQueryDto with optional fields: fromDate (IsDateString), toDate (IsDateString), customerId/loanId/officerId (IsUUID), status (IsEnum of valid statuses), limit (IsInt Min 1 Max 1000), offset (IsInt Min 0). Also export ReportExportQueryDto extending it with required format field (IsEnum [pdf, xlsx, csv]). Update report.controller.ts to use these DTOs. CRITICAL: validate format BEFORE filename interpolation.',
  '',
  '(H13 comment) Foreclosure rebateAuthorizedBy — In execute-foreclosure.dto.ts add a JSDoc comment to rebateAuthorizedBy: "@deprecated Server-derived from authenticated user since 2026-06. Client-supplied value is logged but not trusted." Do NOT remove the field. Do NOT touch foreclosure.service.ts.',
  '',
  '(M11) Settings DTO — In update-setting.dto.ts: keep field value: unknown decorated @IsDefined @IsNotEmpty. Also export a helper function hasPrototypePollutionKey(input: unknown): boolean that recursively walks the input and returns true if any key in any nested object is __proto__, constructor, or prototype. Use a WeakSet to avoid cycles. Then in settings.controller.ts, call hasPrototypePollutionKey(dto.value) and throw BadRequestException with code PROTOTYPE_POLLUTION if true.',
  '',
  '(M12) Status enums on query DTOs:',
  '  - loan-query.dto.ts: status?: string → @IsEnum on const array of all 10 loan status values',
  '  - customer-query.dto.ts: status?: string → @IsEnum on [active, blacklisted, inactive]; riskLevel?: string → @IsEnum on [low, medium, high]',
  '',
  'Report findings mapped to audit IDs.',
].join('\n')

const schedulePrompt = [
  'Fix loan schedule generation in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/schedule/schedule.service.ts',
  '  - apps/api/src/modules/schedule/__tests__/*.spec.ts (you may update test expectations)',
  '',
  'DO NOT TOUCH: collection, disbursement, foreclosure, penalty, reversal, loan, group services.',
  '',
  'CONTEXT — apps/api/src/common/utils/date.util.ts exports parseDateIST(dateStr) and addMonthsClamped.',
  '',
  'FIXES:',
  '',
  '(C1) Weekly/daily installment count in deriveInstallmentCount (around lines 54-67):',
  '  - weekly: Math.ceil(tenureMonths * 52 / 12)',
  '  - daily:  Math.ceil(tenureMonths * 365.25 / 12)',
  '  - monthly: tenureMonths (unchanged)',
  '',
  '(H18) Flat EMI remainder distribution — In flat-rate generation (around 222-256), do NOT dump the entire remainder into the LAST installment. Distribute 1 paisa per installment across the first remainder installments:',
  '  perInstallmentPrincipal = floor(totalPrincipalPaise / N)',
  '  remainder = totalPrincipalPaise - perInstallmentPrincipal * N',
  '  principalPaiseFor(idx) = perInstallmentPrincipal + (idx < remainder ? 1 : 0)',
  '  Apply analogously to interest if also distributed per-installment.',
  '',
  '(H5) Any new Date(dtoFirstEmiDate) where DTO sends YYYY-MM-DD → parseDateIST(dto.firstEmiDate) imported from apps/api/src/common/utils/date.util.ts.',
  '',
  'After: cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run src/modules/schedule 2>&1 | tail -100',
  'If property tests break due to new installment counts, update test expectations to match the new derivation; document each update briefly.',
  '',
  'Report.',
].join('\n')

const collectionPrompt = [
  'Fix collection posting + allocation in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/collection/collection.service.ts',
  '  - apps/api/src/modules/collection/collection.repository.ts',
  '  - apps/api/src/modules/collection/allocation-engine.ts',
  '  - apps/api/src/modules/collection/__tests__/*.spec.ts',
  '',
  'DO NOT TOUCH: schedule, disbursement, foreclosure, penalty, reversal, loan, group services.',
  '',
  'CONTEXT:',
  '  - Schema (already updated): collection_allocations.penalty_id (nullable UUID FK to penalties).',
  '  - apps/api/src/common/utils/date.util.ts exports parseDateIST.',
  '',
  'FIXES:',
  '',
  '(C5) Allocation rounding must keep journal balanced — In allocation-engine.ts after the per-line allocation loop, if excessAmount > 0 and amountPaise was ≤ totalOutstanding, fold the excess into the LAST principal line. Update last.principalPaise += excessAmount, increment running totalPrincipalAllocated and totalAllocated, set excessAmount = 0. INVARIANT after fix: totalAllocated === amountPaise whenever amountPaise ≤ totalOutstanding.',
  '',
  '(H5/H6) Date handling in collection.service.ts:',
  '  - new Date(dto.paymentDate) → parseDateIST(dto.paymentDate)',
  '  - For "today" comparisons (DPD calc, bucket calc) use new Date() — never the user paymentDate',
  '  - computeAutoTransitionStatus (~lines 653-672): rename paymentDate parameter to "now" for clarity',
  '  - computeDpdAndBucket call: pass new Date() not paymentDate for the "today/asOfDate" arg',
  '',
  '(H4 partial) Persist penalty_id on penalty allocations:',
  '  1. In allocation-engine.ts allocatePenalties: set installmentId on the line, sourced from penalty.installment_id. This requires PenaltyState to expose installment_id — confirm collection.repository.ts loadPenaltyStates selects/includes installment_id; add it if missing.',
  '  2. In collection.service.ts buildAllocationRecords (~lines 495-538): remove the "if (!instId) continue" skip for penalty rows. Persist BOTH installment_id (NOT NULL) AND penalty_id (new column) on each allocation row.',
  '',
  '(C2 prep) Expose tx-aware execute path — CRITICAL: refactor postCollection so its full transaction body becomes a new public method:',
  '  async executeCollection(tx: Prisma.TransactionClient, dto, context): Promise<CollectionResult>',
  '  Replace all this.prisma references in the body with tx. Thread tx through any repository methods called. The existing postCollection becomes a thin wrapper:',
  '  async postCollection(dto, ctx) { return this.prisma.$transaction(async (tx) => this.executeCollection(tx, dto, ctx)); }',
  '  Cross-module agent (Phase 4) will call executeCollection from group.service.',
  '',
  '(M15 prep) Ensure a computeOutstanding helper exists (extract or expose) that recomputes cached_outstanding_paise from schedule + pending penalties. The reversal agent will reuse it.',
  '',
  'After: cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run src/modules/collection 2>&1 | tail -100',
  '',
  'Report findings mapped to audit IDs.',
].join('\n')

const disbursementPrompt = [
  'Fix disbursement in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/disbursement/disbursement.service.ts',
  '  - apps/api/src/modules/disbursement/disbursement.repository.ts (if exists)',
  '  - apps/api/src/modules/disbursement/__tests__/*.spec.ts',
  '',
  'DO NOT TOUCH: schedule, collection, loan, foreclosure, etc.',
  '',
  'FIXES:',
  '',
  '(C6) State machine + version check — At lines 191-212 and ~387 direct status writes (disbursed, active) bypass validateTransition + version. Replace with loanService.updateStatus (or equivalent method from loan.service that uses validateTransition + checks version). Consolidate the three status writes into ONE final transition. If the call must be inside the existing $transaction, ensure the loanService method accepts a tx client.',
  '',
  '(M7) createMany for schedule rebuild + hoist dynamic import — Around 317-382:',
  '  - Hoist await import("../schedule/schedule.service") to regular static top-of-file import',
  '  - Replace the N-iteration tx.loan_schedules.create loop with one tx.loan_schedules.createMany({ data: [...] })',
  '  - Keep the deleteMany before it (rebuild case)',
  '',
  '(H5) Date handling — new Date(dto.firstEmiDate) at ~line 319 (and any other YYYY-MM-DD parse) → parseDateIST from apps/api/src/common/utils/date.util.ts.',
  '',
  'After: cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run src/modules/disbursement 2>&1 | tail -100',
  '',
  'Report.',
].join('\n')

const foreclosurePrompt = [
  'Fix foreclosure in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/foreclosure/foreclosure.service.ts',
  '  - apps/api/src/modules/foreclosure/foreclosure.repository.ts (if exists)',
  '  - apps/api/src/modules/foreclosure/__tests__/*.spec.ts',
  '',
  'DO NOT TOUCH: schedule, collection, disbursement, penalty, reversal, loan, group.',
  '',
  'CONTEXT:',
  '  - Schema (locked): loans.last_interest_accrued_to Date? column EXISTS.',
  '  - apps/api/src/common/utils/date.util.ts exports parseDateIST, calendarDaysDiff(a, b), todayISTDate.',
  '',
  'FIXES:',
  '',
  '(C4) Reducing-balance accrued interest from last accrual, not disbursement — Around lines 706-723: compute baseDate = max(loan.last_interest_accrued_to, loan.disbursement_date) or fall back to now. Then days = (settlementDate - baseDate). STOP subtracting interestPaid (that is double-counting). After execute, set loans.last_interest_accrued_to = settlementDate so subsequent attempts compute correctly.',
  '',
  '(C6) State machine + version check at ~lines 487-498 — Replace direct status: "foreclosed" write with loanService.updateStatus (or equivalent) that uses validateTransition.',
  '',
  '(H6) Calendar-day diff, not ms — At lines 99-104 and 132-137 replace (a - b) / 86400000 with calendarDaysDiff(a, b) from date.util.ts.',
  '',
  '(H16) Foreclosure quote freshness at execute — Around lines 374-379, after verifying quote validity, RECOMPUTE current outstanding/settlement from live state. If live amount differs from quoted by > 100 paise (₹1) tolerance, throw QUOTE_STALE requiring a fresh quote.',
  '',
  '(H17) Flat accrued interest clamp — In calculateFlatAccruedInterest (~91-114): elapsedDays = Math.min(totalDays, Math.max(0, raw)).',
  '',
  '(H5) Any new Date(dtoSomeDate) for YYYY-MM-DD string → parseDateIST.',
  '',
  'After: cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run src/modules/foreclosure 2>&1 | tail -100',
  '',
  'Report.',
].join('\n')

const reversalPrompt = [
  'Fix reversal logic in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/reversal/reversal.service.ts',
  '  - apps/api/src/modules/reversal/reversal.repository.ts (if exists)',
  '  - apps/api/src/modules/reversal/__tests__/*.spec.ts',
  '',
  'DO NOT TOUCH other modules.',
  '',
  'CONTEXT:',
  '  - Schema (locked): collection_allocations.penalty_id EXISTS (nullable UUID FK to penalties).',
  '',
  'FIXES:',
  '',
  '(H4) Penalty paid_paise reversal — Around lines 159-181, current logic walks penalties by penalty_period ASC for the installment. Replace with targeted reversal:',
  '  1. Query collection_allocations for the original collection_id where penalty_id IS NOT NULL.',
  '  2. For each row, decrement that exact penalty.paid_paise by row.penalty_paise (use prisma.penalties.update or raw SQL inside the tx).',
  '  3. For pre-migration data (penalty_id NULL), fall back to the old oldest-first walk with a TODO comment.',
  '',
  '(M15) Recompute cached_outstanding — Around lines 239-241, replace currentOutstanding + reversalAmount with full recomputation from schedule + pending penalties. Either call CollectionService.computeOutstanding (if exported) or inline equivalent: sum(principal_paise - principal_paid_paise) + sum(interest_paise - interest_paid_paise) across schedules + sum(unpaid penalties).',
  '',
  'After: cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run src/modules/reversal 2>&1 | tail -100',
  '',
  'Report.',
].join('\n')

const penaltyPrompt = [
  'Fix penalty service in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/penalty/penalty.service.ts',
  '  - apps/api/src/modules/penalty/penalty.repository.ts (if exists)',
  '  - apps/api/src/modules/penalty/__tests__/*.spec.ts',
  '',
  'DO NOT TOUCH other modules.',
  '',
  'CONTEXT:',
  '  - apps/api/src/common/utils/date.util.ts exports calendarDaysDiff(a, b), parseDateIST.',
  '',
  'FIXES:',
  '',
  '(H6) Calendar-day diff for DPD — At lines 59-61 and 192-193 replace ms / 86400000 with calendarDaysDiff(earliestUnpaidDate, referenceDate). When referenceDate comes from a YYYY-MM-DD DTO, parse via parseDateIST (not new Date).',
  '',
  '(M8) Version guard on penalty paid_paise update — In any update that bumps paid_paise (likely raw SQL or Prisma update in penalty.repository.ts), add defensive WHERE clause "paid_paise + delta <= amount_paise" and assert rowcount=1. If 0, throw a clear error. Leave a comment that this relies on the outer FOR UPDATE lock on loans as the primary concurrency control.',
  '',
  '(M16) Penalty compounding — Around line 239, add a comment documenting that current policy excludes outstanding penalty from overdueAmountPaise (no compounding). Do NOT change behavior. Comment should note that toggling settings.penalty_compounding would change this.',
  '',
  'After: cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run src/modules/penalty 2>&1 | tail -100',
  '',
  'Report.',
].join('\n')

const datesPrompt = [
  'Fix date handling + accounting period close + outbox-dispatch race in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/accounting/accounting.service.ts',
  '  - apps/api/src/modules/dashboard/dashboard.service.ts',
  '  - apps/api/src/modules/report/report.service.ts',
  '  - apps/api/src/modules/customer/customer.service.ts',
  '  - apps/api/src/modules/notification/outbox-processor.ts',
  '',
  'DO NOT TOUCH: schedule, collection, disbursement, foreclosure, penalty, reversal, loan, group services. date.util.ts is already updated (calendarDaysDiff, todayISTDate, parseDateIST exist).',
  '',
  'FIXES:',
  '',
  '(H5) IST-anchored "today":',
  '  - dashboard.service.ts (~21-25): replace setHours(0,0,0,0) with todayISTDate() (or parseDateIST(todayIST()))',
  '  - report.service.ts (~644, ~745): same',
  '  - customer.service.ts (~95, ~198): new Date(dto.dob) → parseDateIST(dto.dob)',
  '  - accounting.service.ts (~122): new Date(dto.date) → parseDateIST(dto.date)',
  '  Imports: import { parseDateIST, todayISTDate, todayIST } from "../../common/utils/date.util" (verify path).',
  '',
  '(M10) Period close enforcement — In accounting.service.ts createJournalEntry, before writing the entry, derive period (YYYY-MM from IST-anchored entry_date), then look up prisma.accounting_periods.findUnique({ where: { period } }). If found, throw BadRequestException with code PERIOD_CLOSED and message indicating the period. Use the active tx client if one is in scope.',
  '',
  '(M6) Outbox dispatch outside transaction — In outbox-processor.ts (~44-67), split into phases:',
  '  Phase 1: short tx — fetchAndLockBatch (FOR UPDATE SKIP LOCKED) + markProcessing for those ids, return the messages.',
  '  Phase 2: dispatch concurrently with Promise.allSettled OUTSIDE the tx.',
  '  Phase 3: per result, await markSent or markFailed.',
  '  Reset the processing-running flag only at the end.',
  '',
  'After: cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run src/modules/accounting src/modules/dashboard src/modules/notification src/modules/customer 2>&1 | tail -100',
  '',
  'Report.',
].join('\n')

const mainPrompt = [
  'Harden apps/api/src/main.ts and add CORS_ORIGINS env var in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/main.ts',
  '  - apps/api/src/config/env.validation.ts',
  '',
  'DO NOT TOUCH any module files.',
  '',
  'FIXES:',
  '',
  '(Low) Safe BigInt.toJSON — Replace the existing override at top of main.ts. New behavior: if the bigint is within ±Number.MAX_SAFE_INTEGER, return Number(v); otherwise return v.toString(). This prevents silent precision loss above 2^53.',
  '',
  '(M13) CORS allowlist — Replace app.enableCors({...}) with an env-driven allowlist. Parse env.CORS_ORIGINS (comma-separated). Origin function: if !origin allow (curl/same-origin); if allowedOrigins.includes(origin) allow; else error. credentials: true. methods: GET, POST, PUT, PATCH, DELETE, OPTIONS.',
  '',
  '(M14) CSP harden — Add upgradeInsecureRequests: [] to the helmet directives. Keep unsafe-inline on styleSrc with a TODO comment marking it as tech debt.',
  '',
  '(env) — In env.validation.ts add an optional CORS_ORIGINS string field. Follow the existing class-validator pattern (likely uses @IsString and @IsOptional). Read the file first.',
  '',
  'Report.',
].join('\n')

const moduleAgents = [
  { label: 'auth+guards+app.module', prompt: authPrompt },
  { label: 'DTOs (user/doc/report/settings/queries)', prompt: dtosPrompt },
  { label: 'schedule', prompt: schedulePrompt },
  { label: 'collection+allocation', prompt: collectionPrompt },
  { label: 'disbursement', prompt: disbursementPrompt },
  { label: 'foreclosure', prompt: foreclosurePrompt },
  { label: 'reversal', prompt: reversalPrompt },
  { label: 'penalty', prompt: penaltyPrompt },
  { label: 'dates+accounting+notification', prompt: datesPrompt },
  { label: 'main.ts hardening', prompt: mainPrompt },
]

const moduleResults = await parallel(
  moduleAgents.map((d) => () => agent(d.prompt, { label: d.label, phase: 'Modules' }))
)

log('Phase 3 complete — ' + moduleResults.filter(Boolean).length + '/' + moduleAgents.length + ' module agents succeeded')

// ============================================================================
// CROSS-MODULE
// ============================================================================
phase('Cross-module')

const crossPrompt = [
  'Fix cross-module transactional issues in ' + CWD + '.',
  '',
  'CONTEXT: The collection agent (previous phase) added a new public method on CollectionService named executeCollection that takes (tx: Prisma.TransactionClient, dto, context) and contains the per-collection logic WITHOUT opening its own transaction. The original postCollection now wraps it in prisma.$transaction.',
  '',
  'FILES YOU OWN:',
  '  - apps/api/src/modules/loan/loan.service.ts',
  '  - apps/api/src/modules/loan/loan.repository.ts (read; edit if needed)',
  '  - apps/api/src/modules/group/group.service.ts',
  '',
  'DO NOT TOUCH any other files.',
  '',
  'FIXES:',
  '',
  '(C3) Loan approve() transactional — In loan.service.ts approve() (~lines 318-410), wrap the entire body in await this.prisma.$transaction(async (tx) => { ... }). All repository / sub-service calls inside must use the tx client. Add an optional tx?: Prisma.TransactionClient parameter to repo methods if missing. If ScheduleService.createInstallments uses this.prisma internally, also thread tx through. Goal: ONE tx wrapping all 6 writes (status, schedule, totals, status_history, approval, audit).',
  '',
  '(C2) Group collection NOT nested — In group.service.ts (~373-432), replace this.collectionService.postCollection(dto, ctx) inside the outer prisma.$transaction loop with this.collectionService.executeCollection(tx, dto, ctx). If the actual method name differs, grep apps/api/src/modules/collection/collection.service.ts for the new exported method that takes tx as first arg.',
  '',
  'After: cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run src/modules/loan src/modules/group 2>&1 | tail -100',
  '',
  'Report.',
].join('\n')

await agent(crossPrompt, { label: 'loan-approve+group-tx', phase: 'Cross-module' })

// ============================================================================
// FRONTEND
// ============================================================================
phase('Frontend')

const feSharedPrompt = [
  'Fix shared component, auth, middleware, api-client bugs in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/web/src/components/shared/mobile-card-list.tsx',
  '  - apps/web/src/app/(dashboard)/layout.tsx',
  '  - apps/web/src/providers/auth-provider.tsx',
  '  - apps/web/src/middleware.ts',
  '  - apps/web/src/components/shared/reversal-dialog.tsx',
  '  - apps/web/src/app/(dashboard)/collections/new/page.tsx',
  '  - apps/web/src/components/shared/pagination-controls.tsx',
  '  - apps/web/src/lib/api-client.ts',
  '',
  'DO NOT TOUCH other apps/web files (other agent owns those).',
  '',
  'CONTEXT — pre-created utility exists:',
  '  - apps/web/src/lib/jwt.ts exports decodeJwtPayload(token: string): unknown — handles URL-safe base64 + UTF-8 correctly.',
  '',
  'FIXES:',
  '',
  '(H12) Nested anchor in mobile-card-list — Restructure JSX. Outer becomes a plain <div>. Only the title becomes a <Link href={item.href}> when href is set. Keep TappablePhone (subtitle) and the action <Button> as separate interactive elements (no nested anchors).',
  '',
  '(H13) Dashboard layout redirect during render — In (dashboard)/layout.tsx (~25-28), wrap router.replace in useEffect; return null while not authenticated.',
  '',
  '(H14) JWT decode unicode/URL-safe — Replace JSON.parse(atob(payload)) calls in auth-provider.tsx (~35, ~47) and middleware.ts (~14) with decodeJwtPayload from ../lib/jwt (adjust relative path).',
  '',
  '(H15) Idempotency key regen on retry — In reversal-dialog.tsx (~38) and collections/new/page.tsx (~40), move const idempotencyKey = crypto.randomUUID() INTO the submit handler (not useState). So retries get fresh keys.',
  '',
  '(Low) Pagination always show count — In pagination-controls.tsx (~line 13), instead of returning null at totalPages <= 1, render the "Page X of Y" text always; hide prev/next buttons only when totalPages <= 1.',
  '',
  '(M17) apiClient.postFormData — Add a method to api-client.ts:',
  '  async postFormData<T>(path: string, formData: FormData): Promise<T>',
  '  Mirror the existing post() method: credentials: "include", uses ensureValidToken/auth refresh logic, throws ApiClientError on non-2xx. Do NOT set Content-Type header (browser sets multipart boundary). Pass formData as body.',
  '',
  'Report.',
].join('\n')

const feDashboardPrompt = [
  'Fix dashboard page bugs + React Query hooks in ' + CWD + '.',
  '',
  'FILES YOU OWN:',
  '  - apps/web/src/app/(dashboard)/loans/[id]/page.tsx',
  '  - apps/web/src/app/(dashboard)/loans/new/page.tsx',
  '  - apps/web/src/app/(dashboard)/collections/page.tsx',
  '  - apps/web/src/app/(dashboard)/reports/[type]/page.tsx',
  '  - apps/web/src/app/(dashboard)/profile/change-password/page.tsx',
  '  - apps/web/src/app/(dashboard)/customers/[id]/page.tsx',
  '  - apps/web/src/app/(dashboard)/groups/[id]/collect/page.tsx',
  '  - apps/web/src/hooks/useLoans.ts',
  '',
  'DO NOT TOUCH: shared components, providers, middleware, api-client.',
  '',
  'FIXES:',
  '',
  '(M17 fe) Customer document upload — In customers/[id]/page.tsx (~114-155), replace the hand-rolled fetch with apiClient.postFormData("/documents/upload", formData). The shared-agent in this phase adds postFormData; both edits land together.',
  '',
  '(M18) Lazy useState for todayIST:',
  '  - collections/page.tsx (~26-33): useState(today) → useState(() => todayIST())',
  '  - reports/[type]/page.tsx (~63-65): same fix',
  '',
  '(M19) ApiClientError code branching — In loans/[id]/page.tsx, extract a const CODE_MESSAGES map at the top mapping backend error codes (ALREADY_DISBURSED, COLLECTIONS_EXIST, PERIOD_CLOSED, QUOTE_STALE, QUOTE_EXPIRED, INVALID_TRANSITION, TOKEN_REVOKED) to user-friendly strings. In every catch block (~122, 131, 148, 160, 184, 204, 224, 239, 250, 267), branch: if err instanceof ApiClientError and has body.code, look up the message; otherwise fall back to err.message. Import ApiClientError from where the login page imports it.',
  '',
  '(M20) Change-password error code — In profile/change-password/page.tsx (~86-91), replace substring match with switch on err.body?.code: INVALID_CREDENTIALS → "Current password is incorrect."; PASSWORD_REUSE → "New password matches a recent password. Choose a different one."; COMMON_PASSWORD → "New password is too common; choose a less predictable password."; default to err.body.message or generic fallback.',
  '',
  '(M21) useLoans invalidation — In useLoans.ts (~96-101) useLoanAction onSuccess: also invalidate ["loan"], ["receipts"], ["penalties"], ["foreclosures"], ["status-history"] in addition to ["loans"].',
  '',
  '(M22) loans/new tenure field — In loans/new/page.tsx (~32), replace z.coerce.number().int().min(1) with z.number({ required_error: "Tenure is required", invalid_type_error: "Tenure must be a positive number" }).int().min(1, ...).max(120, ...). Update setValueAs (~309) so empty/null returns undefined and invalid strings are passed through to trigger invalid_type_error.',
  '',
  '(M23) Foreclosure setInterval cleanup — In loans/[id]/page.tsx (~107-113), guard the useEffect so the interval only runs when both foreclosureOpen and foreclosureQuote are set; return cleanup. Also clear foreclosureQuote when the dialog closes via cancel/onOpenChange(false).',
  '',
  '(Low) groups/[id]/collect (~102): String(outstanding_paise / 100) → (outstanding_paise / 100).toFixed(2).',
  '',
  'Report.',
].join('\n')

await parallel([
  () => agent(feSharedPrompt, { label: 'web:shared+auth+middleware', phase: 'Frontend' }),
  () => agent(feDashboardPrompt, { label: 'web:dashboard pages + hooks', phase: 'Frontend' }),
])

// ============================================================================
// VERIFY
// ============================================================================
phase('Verify')

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    passing: { type: 'array', items: { type: 'string' } },
    failing: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          test: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['file', 'reason'],
      },
    },
    typeErrors: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'number' },
          message: { type: 'string' },
        },
        required: ['file', 'message'],
      },
    },
    brokenBuild: { type: 'array', items: { type: 'string' } },
  },
  required: ['passing', 'failing', 'typeErrors', 'brokenBuild'],
}

const verifyPrompt = [
  'Run the test/lint suite at ' + CWD + ' and report failures.',
  '',
  'Commands (in order, fast suites first):',
  '1. cd ' + CWD + ' && pnpm -r --filter @as-finance/shared test 2>&1 | tail -100',
  '2. cd ' + CWD + ' && pnpm --filter @as-finance/api test:unit 2>&1 | tail -300',
  '3. cd ' + CWD + ' && pnpm --filter @as-finance/web test 2>&1 | tail -100',
  '4. cd ' + CWD + ' && pnpm --filter @as-finance/api lint 2>&1 | tail -150',
  '',
  'For each, capture exit code and failing test/lint names. DO NOT fix anything yet.',
  '',
  'Structured report per schema:',
  '- passing: suites passing cleanly (e.g. "api:auth", "shared")',
  '- failing: [{ file, test?, reason }]',
  '- typeErrors: [{ file, line?, message }]',
  '- brokenBuild: suites that could not start (import errors etc.)',
].join('\n')

const testResult = await agent(verifyPrompt, {
  label: 'run all tests',
  phase: 'Verify',
  schema: TEST_SCHEMA,
})

log('Tests run. Passing: ' + (testResult.passing?.length ?? 0) +
    '; Failing: ' + (testResult.failing?.length ?? 0) +
    '; Type errors: ' + (testResult.typeErrors?.length ?? 0) +
    '; Broken builds: ' + (testResult.brokenBuild?.length ?? 0))

// ============================================================================
// FIX FAILURES
// ============================================================================
phase('Fix tests')

const failureGroups = new Map()
for (const f of (testResult.failing || [])) {
  if (!failureGroups.has(f.file)) failureGroups.set(f.file, [])
  failureGroups.get(f.file).push(f)
}
for (const e of (testResult.typeErrors || [])) {
  if (!failureGroups.has(e.file)) failureGroups.set(e.file, [])
  failureGroups.get(e.file).push({ file: e.file, reason: 'Type error line ' + (e.line ?? '?') + ': ' + e.message, isTypeError: true })
}
for (const b of (testResult.brokenBuild || [])) {
  if (!failureGroups.has(b)) failureGroups.set(b, [])
  failureGroups.get(b).push({ file: b, reason: 'Broken build', isBrokenBuild: true })
}

if (failureGroups.size === 0) {
  log('All green — no failures to fix.')
  return { ok: true, message: 'All audit findings implemented and tests pass.' }
}

log('Fixing ' + failureGroups.size + ' files with failures or type errors')

await parallel(
  Array.from(failureGroups.entries()).map(([file, failures]) => () => {
    const failuresJson = JSON.stringify(failures, null, 2)
    const fixPrompt = [
      'Fix failing tests / type errors in ' + file + ' at ' + CWD + '.',
      '',
      'Audit-fix workflow changed business logic. Determine for each failure whether the TEST is outdated (update it to match new correct behavior) or the IMPLEMENTATION introduced a regression (fix that).',
      '',
      'Failures (JSON):',
      failuresJson,
      '',
      'Guidance:',
      '- Test asserting weekly installmentCount = tenureMonths * 4 is OUTDATED (audit C1 → ceil * 52/12). Update.',
      '- Test asserting daily installmentCount = tenureMonths * 30 is OUTDATED → ceil * 365.25/12. Update.',
      '- Test asserting specific allocation amount: recompute with new excess-into-last-principal (audit C5).',
      '- Type error from new method signature (e.g. executeCollection with tx param): update test setup.',
      '- NaN/undefined where number expected: regression — fix the implementation.',
      '',
      'You may edit BOTH the test file AND a single related implementation file if a real regression is found. Do not undo audit-required behavior changes.',
      '',
      'After fixing, run cd ' + CWD + ' && pnpm --filter @as-finance/api vitest run ' + file.replace(/^apps\/api\//, '') + ' 2>&1 | tail -100 to verify (adjust workspace command if file is in shared or web).',
      '',
      'Report what you changed and whether tests now pass.',
    ].join('\n')
    return agent(fixPrompt, { label: 'fix:' + file.split('/').pop(), phase: 'Fix tests' })
  })
)

const finalPrompt = [
  'Final test verification at ' + CWD + '.',
  '',
  'Run:',
  '1. cd ' + CWD + ' && pnpm --filter @as-finance/api test:unit 2>&1 | tail -100',
  '2. cd ' + CWD + ' && pnpm -r --filter @as-finance/shared test 2>&1 | tail -50',
  '3. cd ' + CWD + ' && pnpm --filter @as-finance/web test 2>&1 | tail -50',
  '',
  'Report counts: total tests, passed, failed. List any remaining failures briefly. If 0 failures across all three commands, output ALL GREEN.',
].join('\n')

const finalCheck = await agent(finalPrompt, { label: 'final verification', phase: 'Fix tests' })

return {
  ok: true,
  fixedFiles: Array.from(failureGroups.keys()),
  finalCheck,
}
