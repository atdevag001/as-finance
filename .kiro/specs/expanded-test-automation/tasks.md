# Tasks: Expanded Test Automation

## Task 1: k6 Load Test Infrastructure
- [x] 1.1 Create `apps/api/test/load/config.js` with configurable base URL, default headers, and shared threshold definitions
- [x] 1.2 Create `apps/api/test/load/helpers/auth.js` with JWT token generation for load test authentication using seed user credentials
- [x] 1.3 Create `apps/api/test/load/helpers/data.js` with payload generators for collection, disbursement, and reversal requests
- [x] 1.4 Add `test:load` npm script to `apps/api/package.json`

## Task 2: Collection Posting Load Test
- [x] 2.1 Create `apps/api/test/load/scenarios/collection-load.js` with 20 VU × 60s scenario, P95 < 2000ms threshold, and error rate < 5% threshold (excluding 409s)
- [x] 2.2 Create `apps/api/test/load/verify-collection-load.ts` post-run verification script that parses k6 JSON summary and checks idempotency (one record per key) and allocation preservation invariant against the database

## Task 3: Mixed Workload Load Test
- [x] 3.1 Create `apps/api/test/load/scenarios/mixed-workload.js` with 10 VU collections + 5 VU report generation concurrent scenario, P95 < 5000ms for reports, zero 500 errors on reports, overall error rate < 5%

## Task 4: Disbursement and Reversal Load Test
- [x] 4.1 Create `apps/api/test/load/scenarios/disbursement-reversal.js` with 10 VU disbursements (30s) + 5 VU reversals (30s), P95 < 3000ms thresholds, idempotency verification for both endpoints

## Task 5: Pact Consumer Test Infrastructure
- [x] 5.1 Add `@pact-foundation/pact` to `apps/web/package.json` devDependencies and create `apps/web/test/pact/vitest.pact.ts` Vitest config
- [x] 5.2 Create `apps/web/test/pact/setup.ts` with PactV3 mock server configuration, shared matchers (integer matcher for paise fields, string matcher for UUIDs, ISO date matcher), and provider name constants
- [x] 5.3 Add `test:pact` npm script to `apps/web/package.json`

## Task 6: Pact Consumer Contract — Auth and Customer
- [x] 6.1 Create `apps/web/test/pact/auth.consumer.pact.spec.ts` with login and refresh token interactions
- [x] 6.2 Create `apps/web/test/pact/customer.consumer.pact.spec.ts` with customer CRUD interactions

## Task 7: Pact Consumer Contract — Collection Posting
- [x] 7.1 Create `apps/web/test/pact/collection.consumer.pact.spec.ts` with POST /collections happy path (201 with full allocation response), missing fields (400), and unauthenticated (401) interactions; money fields use integer matchers

## Task 8: Pact Consumer Contract — Loan Schedule and Remaining
- [x] 8.1 Create `apps/web/test/pact/schedule.consumer.pact.spec.ts` with GET /loans/:id happy path (loan detail + schedules array with installment structure), and 404 for non-existent loan
- [x] 8.2 Create `apps/web/test/pact/loan.consumer.pact.spec.ts` with loan lifecycle interactions (create, approve, disburse)
- [x] 8.3 Create `apps/web/test/pact/reversal.consumer.pact.spec.ts` with reversal interaction
- [x] 8.4 Create `apps/web/test/pact/report.consumer.pact.spec.ts` with report generation interaction

## Task 9: Pact Provider Verification
- [x] 9.1 Create `apps/api/test/pact/state-handlers.ts` with provider state setup functions for each consumer-defined state (active loan, posted collection, authenticated user, etc.)
- [x] 9.2 Create `apps/api/test/pact/provider-verification.spec.ts` that verifies all Pact files from `apps/web/test/pact/pacts/` against the running API with JWT auth and state handlers
- [x] 9.3 Add `test:pact:verify` npm script to `apps/api/package.json`

## Task 10: Chaos Test Harness Infrastructure
- [x] 10.1 Create `apps/api/test/chaos/fault-injector.ts` with `injectDbConnectionDrop`, `injectDbTimeout`, `injectS3Outage`, and `injectSmsFailure` helper functions, each returning a restore/cleanup function
- [x] 10.2 Create `apps/api/test/chaos/snapshot.ts` with `capturePreTransactionSnapshot` and `assertStateUnchanged` helpers using `createDbUtils`
- [x] 10.3 Add `test:chaos` npm script to `apps/api/package.json`

## Task 11: Chaos Test — DB Failure During Collection
- [x] 11.1 Create `apps/api/test/chaos/collection-db-failure.chaos.spec.ts` that injects DB connection drop mid-collection-transaction and verifies: no partial records persisted (Property 4), outstanding unchanged (Property 4), recovery with new idempotency key succeeds, and error response includes request ID

## Task 12: Chaos Test — DB Failure During Reversal
- [x] 12.1 Create `apps/api/test/chaos/reversal-db-failure.chaos.spec.ts` that injects DB connection drop mid-reversal-transaction and verifies: original collection remains "posted" (Property 5), no compensating records persisted (Property 5), trial balance unchanged (Property 5), and recovery with new idempotency key succeeds

## Task 13: Chaos Test — S3 Outage
- [x] 13.1 Create `apps/api/test/chaos/s3-outage.chaos.spec.ts` that injects S3 unavailability and verifies: document upload fails cleanly with no partial DB record (Property 6), customer/loan operations unaffected (Property 7), and recovery after S3 restoration

## Task 14: Chaos Test — Network Latency and Timeout
- [x] 14.1 Create `apps/api/test/chaos/network-latency.chaos.spec.ts` that injects DB query latency/timeout and verifies: collection either succeeds or fails cleanly (Property 8), disbursement timeout leaves loan in "approved" status (Property 8), penalty timeout leaves no orphaned records (Property 8)

## Task 15: Chaos Test — SMS Failure Isolation
- [x] 15.1 Create `apps/api/test/chaos/sms-isolation.chaos.spec.ts` that injects SMS provider failure and verifies: collection finance records all persisted (Property 9), outbox message enqueued (Property 9), disbursement completes with loan status "active"
