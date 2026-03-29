# Design Document — Comprehensive E2E Testing for AS Finance LMS

## Overview

This design specifies the architecture, infrastructure, and organization for a comprehensive end-to-end test suite that validates the AS Finance Loan Management System against real infrastructure. Unlike the existing unit test suite (which uses mocked dependencies), this test suite exercises the full stack: PostgreSQL database, MinIO object storage, NestJS API, and Next.js frontend via Playwright.

The test suite is organized into seven categories:
1. **Integration Tests** — Multi-service flows against a real PostgreSQL database
2. **E2E API Tests** — Full HTTP request/response cycles via Supertest against the live NestJS API
3. **Property-Based Tests (PBT)** — fast-check driven invariant verification against real infrastructure
4. **Negative Tests** — Invalid input rejection and error response validation against the live API
5. **Concurrency Tests** — Idempotency, locking, and conflict detection with real database constraints
6. **Security Tests** — RBAC enforcement, auth bypass resistance, IDOR prevention against the live API
7. **Playwright Tests** — Browser-based UI E2E tests against the running Next.js frontend

### Key Design Decisions

- **Real infrastructure, not mocks**: Every test hits a real PostgreSQL instance, real MinIO, and real API server. This catches integration bugs that mocked tests miss (constraint violations, transaction isolation issues, query performance).
- **Transaction-based isolation**: Integration tests wrap each test suite in a transaction that rolls back after completion, preventing cross-test pollution without the overhead of full database resets.
- **Factory pattern for test data**: Reusable factory functions create valid entities with sensible defaults, overridable per test. Factories call the real API endpoints to ensure data passes all validation.
- **Authenticated HTTP clients**: Pre-configured Supertest clients for each role (super_admin, manager, field_officer, collection_officer, accountant) with valid JWT tokens.
- **Deterministic seeding**: A seed script creates a known baseline state (users, products, chart of accounts, settings) before the test suite runs.
- **Playwright MCP integration**: Browser-based tests use Playwright MCP for UI automation against the running Next.js frontend, covering login, customer onboarding, loan application, collection posting, dashboard KPI verification, and receipt print view.
- **fast-check custom arbitraries**: Domain-specific generators for valid Aadhaar numbers, PAN numbers, mobile numbers, paise amounts, loan parameters, and payment sequences ensure property-based tests exercise realistic inputs.

## Architecture

```mermaid
graph TB
    subgraph Test Runner
        V[Vitest]
        FC[fast-check]
        PW[Playwright MCP]
    end

    subgraph Test Infrastructure
        TH[Test Helpers]
        TF[Test Factories]
        AC[Auth Clients]
        DB_UTIL[DB Utilities]
        ARB[fast-check Arbitraries]
    end

    subgraph System Under Test
        API[NestJS API :3001]
        WEB[Next.js Frontend :3000]
        PG[(PostgreSQL :5432)]
        MINIO[(MinIO :9000)]
    end

    V --> TH
    V --> FC
    V --> PW
    TH --> TF
    TH --> AC
    TH --> DB_UTIL
    FC --> ARB

    AC -->|HTTP + JWT| API
    PW -->|Browser| WEB
    WEB -->|API calls| API
    API --> PG
    API --> MINIO
    DB_UTIL -->|Direct Prisma| PG
```

### Test Execution Flow

```mermaid
sequenceDiagram
    participant V as Vitest
    participant S as globalSetup
    participant DB as PostgreSQL
    participant API as NestJS API
    participant T as Test Suite

    V->>S: Run globalSetup
    S->>DB: Verify connection
    S->>DB: Run migrations (if needed)
    S->>DB: Seed baseline data (users, products, accounts, holidays)
    S->>API: Health check (/health/ready)
    V->>T: Execute test suites
    T->>API: HTTP requests via Supertest
    API->>DB: Queries/mutations
    T->>DB: Direct verification queries
    T->>T: Assertions
    V->>S: Run globalTeardown
    S->>DB: Clean test data
```


### Directory Structure

```
apps/api/
├── test/
│   ├── vitest.e2e.config.ts          # Dedicated Vitest config for E2E tests
│   ├── setup/
│   │   ├── global-setup.ts           # Vitest globalSetup: DB connection, migrations, seed
│   │   ├── global-teardown.ts        # Vitest globalTeardown: cleanup
│   │   └── test-config.ts            # Environment config (DB URL, API URL, etc.)
│   ├── helpers/
│   │   ├── auth-client.ts            # Authenticated Supertest clients per role
│   │   ├── db-utils.ts               # Direct Prisma client for verification queries
│   │   ├── factories.ts              # Entity factory functions (customer, loan, product, etc.)
│   │   ├── arbitraries.ts            # fast-check custom arbitrary generators
│   │   ├── seed.ts                   # Baseline seed data (users, chart of accounts, products)
│   │   └── cleanup.ts                # Per-suite cleanup utilities
│   ├── e2e/
│   │   ├── auth.e2e.spec.ts                    # Login, logout, refresh, lockout, password change
│   │   ├── user-management.e2e.spec.ts         # User CRUD, role assignment, area assignments
│   │   ├── customer-onboarding.e2e.spec.ts     # Customer creation, KYC, duplicate detection
│   │   ├── family-guarantor.e2e.spec.ts        # Family member and guarantor CRUD
│   │   ├── loan-product.e2e.spec.ts            # Product creation, versioning, validation
│   │   ├── loan-lifecycle.e2e.spec.ts          # Loan state machine, maker-checker
│   │   ├── emi-schedule.e2e.spec.ts            # Schedule generation, determinism, holidays
│   │   ├── disbursement.e2e.spec.ts            # Disbursement flow, prerequisites, idempotency
│   │   ├── collection.e2e.spec.ts              # Collection posting, allocation, receipts
│   │   ├── reversal.e2e.spec.ts                # Reversal flow, compensating entries
│   │   ├── overdue-penalty.e2e.spec.ts         # Overdue detection, penalty posting, waiver
│   │   ├── foreclosure.e2e.spec.ts             # Foreclosure quote, settlement, expiry
│   │   ├── loan-closure.e2e.spec.ts            # Closure prerequisites, status transition
│   │   ├── group-loan.e2e.spec.ts              # Group creation, group collection, receipts
│   │   ├── accounting-ledger.e2e.spec.ts       # Journal entries, trial balance, daybook
│   │   ├── cashbook-expense.e2e.spec.ts        # Expense recording, cash handover
│   │   ├── notification-outbox.e2e.spec.ts     # SMS enqueueing, retry, dead-letter, isolation
│   │   ├── report.e2e.spec.ts                  # Report generation, RBAC scoping, export, rate limit
│   │   ├── settings-holiday.e2e.spec.ts        # Settings CRUD, holiday calendar management
│   │   ├── audit-log.e2e.spec.ts               # Audit log completeness, append-only, queries
│   │   ├── health-check.e2e.spec.ts            # /health/live and /health/ready endpoints
│   │   ├── env-validation.e2e.spec.ts          # Zod-based startup env validator
│   │   ├── request-id.e2e.spec.ts              # x-request-id propagation
│   │   └── business-flows.e2e.spec.ts          # Full end-to-end business flow scenarios
│   ├── pbt/
│   │   ├── allocation.pbt.spec.ts              # Allocation preservation and order
│   │   ├── schedule.pbt.spec.ts                # Schedule reconciliation and determinism
│   │   ├── journal-balance.pbt.spec.ts         # Journal entry balance and trial balance
│   │   ├── outstanding.pbt.spec.ts             # Outstanding balance invariant
│   │   ├── reversal-neutrality.pbt.spec.ts     # Reversal ledger neutrality
│   │   ├── advance-payment.pbt.spec.ts         # Advance payment allocation to future installments
│   │   ├── receipt-sequentiality.pbt.spec.ts   # Receipt number ordering
│   │   ├── cashbook-reconciliation.pbt.spec.ts # Cashbook balance reconciliation
│   │   └── rbac-matrix.pbt.spec.ts             # RBAC exhaustive role × endpoint coverage
│   ├── negative.e2e.spec.ts                    # Comprehensive negative/boundary tests
│   ├── concurrency.e2e.spec.ts                 # Idempotency, locking, collision tests
│   └── security.e2e.spec.ts                    # RBAC, IDOR, injection, rate limiting tests
apps/web/
├── test/
│   ├── playwright.config.ts                    # Playwright configuration
│   └── e2e/
│       ├── login.playwright.spec.ts            # Login flow, error states, lockout
│       ├── customer-onboarding.playwright.spec.ts  # Customer form, validation, KYC upload
│       ├── loan-application.playwright.spec.ts     # Loan creation, submission, approval
│       ├── collection-posting.playwright.spec.ts   # Collection form, receipt view
│       ├── dashboard.playwright.spec.ts            # Dashboard KPI verification
│       ├── receipt-print.playwright.spec.ts        # Receipt print view rendering
│       ├── mobile-responsive.playwright.spec.ts    # Mobile viewport testing
│       └── confirmation-dialogs.playwright.spec.ts # Finance action confirmation dialogs
```


## Components and Interfaces

### 1. Vitest E2E Configuration (`test/vitest.e2e.config.ts`)

Dedicated Vitest configuration for the E2E test suite, separate from the unit test config.

```typescript
// vitest.e2e.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/e2e/**/*.e2e.spec.ts',
      'test/pbt/**/*.pbt.spec.ts',
      'test/negative.e2e.spec.ts',
      'test/concurrency.e2e.spec.ts',
      'test/security.e2e.spec.ts',
    ],
    globalSetup: ['test/setup/global-setup.ts'],
    testTimeout: 30_000,       // 30s per test (real DB operations)
    hookTimeout: 60_000,       // 60s for setup/teardown hooks
    pool: 'forks',             // Isolate test files in separate processes
    poolOptions: {
      forks: { maxForks: 1 },  // Sequential execution for DB-dependent tests
    },
    reporters: ['verbose'],
    bail: 0,                   // Run all tests even if some fail
  },
});
```

### 2. Global Setup / Teardown (`test/setup/`)

Responsible for establishing the test environment before any test suite runs and cleaning up after all suites complete.

```typescript
// global-setup.ts
interface GlobalSetupContext {
  prisma: PrismaClient;
  apiBaseUrl: string;
  seedData: {
    users: Record<UserRole, { id: string; token: string }>;
    products: { flatProduct: LoanProduct; reducingProduct: LoanProduct };
    accounts: ChartOfAccounts;
    settings: SystemSettings;
    holidays: Date[];
  };
}
```

**Responsibilities:**
- Verify PostgreSQL connectivity and run pending migrations
- Verify API server health via `GET /health/ready`
- Seed baseline data: users (one per role, plus a second manager for maker-checker), loan products, chart of accounts, holiday calendar
- Generate and cache JWT tokens for each role
- Export seed data references for use in test suites

### 3. Authenticated HTTP Clients (`test/helpers/auth-client.ts`)

Pre-configured Supertest agents with valid JWT authorization headers for each role.

```typescript
interface AuthClients {
  superAdmin: SuperTest.Agent;
  manager: SuperTest.Agent;
  manager2: SuperTest.Agent;       // Second manager for maker-checker tests
  fieldOfficer: SuperTest.Agent;
  collectionOfficer: SuperTest.Agent;
  accountant: SuperTest.Agent;
  officeStaff: SuperTest.Agent;
  viewerAuditor: SuperTest.Agent;
  unauthenticated: SuperTest.Agent; // No auth header
  expired: SuperTest.Agent;         // Expired JWT for auth tests
  tampered: SuperTest.Agent;        // Tampered JWT for security tests
}

function createAuthClients(apiBaseUrl: string, tokens: Record<UserRole, string>): AuthClients;
```

### 4. Database Utilities (`test/helpers/db-utils.ts`)

Direct Prisma client for verification queries that bypass the API layer. Used to assert database state after API operations.

```typescript
interface DbUtils {
  prisma: PrismaClient;
  // Verification queries
  findCustomerById(id: string): Promise<Customer | null>;
  findLoanById(id: string): Promise<Loan | null>;
  findSchedulesByLoanId(loanId: string): Promise<LoanSchedule[]>;
  findCollectionsByLoanId(loanId: string): Promise<Collection[]>;
  findJournalEntryById(id: string): Promise<JournalEntry | null>;
  findJournalLinesByEntryId(entryId: string): Promise<JournalLine[]>;
  findAuditLogsByTarget(entityType: string, entityId: string): Promise<AuditLog[]>;
  findReceiptByCollectionId(collectionId: string): Promise<Receipt | null>;
  findPenaltiesByLoanId(loanId: string): Promise<Penalty[]>;
  findOutboxMessagesBySource(sourceType: string, sourceId: string): Promise<OutboxMessage[]>;
  findUserById(id: string): Promise<User | null>;
  findRefreshTokensByUserId(userId: string): Promise<RefreshToken[]>;
  findSettingByKey(key: string): Promise<Setting | null>;
  findFamilyMembersByCustomerId(customerId: string): Promise<FamilyMember[]>;
  findGuarantorsByCustomerId(customerId: string): Promise<Guarantor[]>;
  // Aggregate queries
  sumAllocationsForCollection(collectionId: string): Promise<{ penalty: bigint; interest: bigint; principal: bigint }>;
  getLoanOutstanding(loanId: string): Promise<bigint>;
  getTrialBalanceTotals(): Promise<{ totalDebits: bigint; totalCredits: bigint }>;
  getCashbookBalance(date: string): Promise<{ opening: bigint; inflows: bigint; outflows: bigint; closing: bigint }>;
  countReceiptsForLoan(loanId: string): Promise<number>;
  getReceiptNumberRange(loanId: string): Promise<{ min: string; max: string }>;
  // Cleanup
  cleanupTestData(prefix: string): Promise<void>;
}
```

### 5. Test Factories (`test/helpers/factories.ts`)

Factory functions that create valid entities via the API, returning the created entity with its ID. Each factory accepts optional overrides for customization.

```typescript
interface Factories {
  // Auth
  loginAs(role: UserRole): Promise<{ token: string; userId: string }>;

  // User management
  createUser(client: SuperTest.Agent, overrides?: Partial<CreateUserDto>): Promise<UserResponse>;
  assignArea(client: SuperTest.Agent, userId: string, areaName: string): Promise<void>;

  // Customer with family and guarantors
  createCustomer(client: SuperTest.Agent, overrides?: Partial<CreateCustomerDto>): Promise<CustomerResponse>;
  addFamilyMember(client: SuperTest.Agent, customerId: string, overrides?: Partial<CreateFamilyMemberDto>): Promise<FamilyMemberResponse>;
  addGuarantor(client: SuperTest.Agent, customerId: string, overrides?: Partial<CreateGuarantorDto>): Promise<GuarantorResponse>;

  // Loan product
  createLoanProduct(client: SuperTest.Agent, overrides?: Partial<CreateLoanProductDto>): Promise<LoanProductResponse>;

  // Loan lifecycle
  createLoan(client: SuperTest.Agent, opts: {
    customerId: string;
    productVersionId: string;
    overrides?: Partial<CreateLoanDto>;
    advanceTo?: LoanStatus;
  }): Promise<LoanResponse>;

  // Collection
  postCollection(client: SuperTest.Agent, opts: {
    loanId: string;
    amountPaise: number;
    overrides?: Partial<PostCollectionDto>;
  }): Promise<CollectionResponse>;

  // Group
  createGroup(client: SuperTest.Agent, opts: {
    memberCount: number;
    overrides?: Partial<CreateGroupDto>;
  }): Promise<GroupResponse>;

  // Expense
  recordExpense(client: SuperTest.Agent, overrides?: Partial<CreateExpenseDto>): Promise<ExpenseResponse>;

  // Cash handover
  createHandover(client: SuperTest.Agent, overrides?: Partial<CreateHandoverDto>): Promise<HandoverResponse>;

  // Utility: advance a loan through the full lifecycle to 'active' status
  advanceLoanToActive(clients: AuthClients, customerId: string, productVersionId: string): Promise<LoanResponse>;

  // Utility: create a fully disbursed loan with N collections posted
  createLoanWithPayments(clients: AuthClients, opts: {
    paymentCount: number;
    paymentAmountPaise: number;
  }): Promise<{ loan: LoanResponse; collections: CollectionResponse[] }>;
}
```

### 6. fast-check Custom Arbitrary Generators (`test/helpers/arbitraries.ts`)

Domain-specific generators for property-based tests that produce valid, realistic inputs.

```typescript
import * as fc from 'fast-check';

/** Valid 12-digit Aadhaar number (does not start with 0 or 1) */
export const arbAadhaarNumber: fc.Arbitrary<string> =
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 12, maxLength: 12 })
    .filter(s => s[0] !== '0' && s[0] !== '1');

/** Valid PAN number: AAAAA9999A pattern */
export const arbPanNumber: fc.Arbitrary<string> =
  fc.tuple(
    fc.stringOf(fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')), { minLength: 5, maxLength: 5 }),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 4, maxLength: 4 }),
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''))
  ).map(([letters, digits, last]) => `${letters}${digits}${last}`);

/** Valid Indian mobile number: 10 digits starting with 6-9 */
export const arbMobileNumber: fc.Arbitrary<string> =
  fc.tuple(
    fc.constantFrom('6', '7', '8', '9'),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 9, maxLength: 9 })
  ).map(([first, rest]) => `${first}${rest}`);

/** Valid paise amount: positive integer within typical loan ranges */
export const arbPaiseAmount: fc.Arbitrary<number> =
  fc.integer({ min: 100, max: 100_000_00 }); // 1 INR to 1,00,000 INR

/** Valid principal amount in paise within product bounds */
export const arbPrincipalPaise = (min: number, max: number): fc.Arbitrary<number> =>
  fc.integer({ min, max });

/** Valid annual rate in basis points (100 = 1%, typical range 600-3600 = 6%-36%) */
export const arbAnnualRateBps: fc.Arbitrary<number> =
  fc.integer({ min: 600, max: 3600 });

/** Valid tenure in months (1-60) */
export const arbTenureMonths: fc.Arbitrary<number> =
  fc.integer({ min: 1, max: 60 });

/** Valid interest type */
export const arbInterestType: fc.Arbitrary<'flat' | 'reducing_balance'> =
  fc.constantFrom('flat' as const, 'reducing_balance' as const);

/** Valid repayment frequency */
export const arbFrequency: fc.Arbitrary<'daily' | 'weekly' | 'monthly'> =
  fc.constantFrom('daily' as const, 'weekly' as const, 'monthly' as const);

/** Valid payment mode */
export const arbPaymentMode: fc.Arbitrary<'cash' | 'bank_transfer' | 'online'> =
  fc.constantFrom('cash' as const, 'bank_transfer' as const, 'online' as const);

/** Valid loan parameters tuple for schedule generation */
export const arbLoanParams: fc.Arbitrary<{
  principalPaise: number;
  annualRateBps: number;
  tenureMonths: number;
  interestType: 'flat' | 'reducing_balance';
  frequency: 'monthly' | 'weekly' | 'daily';
}> = fc.record({
  principalPaise: fc.integer({ min: 5_000_00, max: 50_000_00 }),
  annualRateBps: arbAnnualRateBps,
  tenureMonths: fc.integer({ min: 3, max: 36 }),
  interestType: arbInterestType,
  frequency: arbFrequency,
});

/** Valid payment sequence: array of positive paise amounts that don't exceed total payable */
export const arbPaymentSequence = (totalPayablePaise: number, maxPayments: number): fc.Arbitrary<number[]> =>
  fc.array(fc.integer({ min: 100, max: Math.min(totalPayablePaise, 50_000_00) }), { minLength: 1, maxLength: maxPayments })
    .filter(payments => payments.reduce((a, b) => a + b, 0) <= totalPayablePaise);

/** Valid state transition pair for loan state machine testing */
export const arbLoanStatusPair: fc.Arbitrary<{ from: string; to: string }> =
  fc.record({
    from: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'active', 'overdue', 'defaulted', 'foreclosed', 'closed'),
    to: fc.constantFrom('draft', 'submitted', 'under_review', 'approved', 'rejected', 'disbursed', 'active', 'overdue', 'defaulted', 'foreclosed', 'closed'),
  });

/** Valid user role */
export const arbUserRole: fc.Arbitrary<string> =
  fc.constantFrom('super_admin', 'manager', 'field_officer', 'collection_officer', 'accountant', 'office_staff', 'viewer_auditor');

/** Invalid Aadhaar: any string that is NOT exactly 12 digits */
export const arbInvalidAadhaar: fc.Arbitrary<string> =
  fc.oneof(
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 11 }),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 13, maxLength: 20 }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 12, maxLength: 12 }),
  );

/** Invalid PAN: any string that does NOT match AAAAA9999A */
export const arbInvalidPan: fc.Arbitrary<string> =
  fc.oneof(
    fc.string({ minLength: 1, maxLength: 9 }),
    fc.string({ minLength: 11, maxLength: 15 }),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 10, maxLength: 10 }),
  );

/** Whitespace-only strings for empty input testing */
export const arbWhitespaceOnly: fc.Arbitrary<string> =
  fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { minLength: 0, maxLength: 20 });
```

### 7. Cleanup Utilities (`test/helpers/cleanup.ts`)

Handles test data cleanup between suites. Uses a naming convention (test data prefixed with `test_`) and cascading deletes.

```typescript
interface CleanupUtils {
  cleanupAll(): Promise<void>;
  cleanupSuite(suiteId: string): Promise<void>;
  track(entity: { table: string; id: string }): void;
}
```

### 8. Playwright Test Configuration (`apps/web/test/playwright.config.ts`)

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,          // Sequential for state-dependent tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-android',
      use: {
        ...devices['Pixel 5'],
        // Mobile viewport for collection officer workflows
      },
    },
  ],
  webServer: {
    command: 'pnpm --filter web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```


## Data Models

### Test Configuration

```typescript
interface TestConfig {
  database: {
    url: string;           // postgresql://postgres:AsFinance2024!@localhost:5432/as_finance_lms
    maxConnections: number; // 5 for test pool
  };
  api: {
    baseUrl: string;       // http://localhost:3001
    healthEndpoint: string; // /health/ready
    timeoutMs: number;     // 30000
  };
  frontend: {
    baseUrl: string;       // http://localhost:3000
  };
  minio: {
    endpoint: string;      // localhost
    port: number;          // 9000
    accessKey: string;     // minioadmin
    secretKey: string;     // minioadmin
  };
  pbt: {
    defaultNumRuns: number;   // 100
    financeNumRuns: number;   // 1000
  };
}
```

### Seed Data Schema

```typescript
interface SeedData {
  users: {
    superAdmin: { id: string; username: string; token: string };
    manager: { id: string; username: string; token: string };
    manager2: { id: string; username: string; token: string }; // For maker-checker tests
    fieldOfficer: { id: string; username: string; token: string };
    collectionOfficer: { id: string; username: string; token: string };
    accountant: { id: string; username: string; token: string };
    officeStaff: { id: string; username: string; token: string };
    viewerAuditor: { id: string; username: string; token: string };
  };
  products: {
    flatMonthly: { id: string; versionId: string; config: LoanProductConfig };
    reducingMonthly: { id: string; versionId: string; config: LoanProductConfig };
    flatWeekly: { id: string; versionId: string; config: LoanProductConfig };
    withProcessingFee: { id: string; versionId: string; config: LoanProductConfig };
  };
  accounts: {
    cash: { id: string; code: '1001' };
    bank: { id: string; code: '1002' };
    loansReceivable: { id: string; code: '1100' };
    interestIncome: { id: string; code: '4001' };
    processingFeeIncome: { id: string; code: '4002' };
    penaltyIncome: { id: string; code: '4003' };
    travelExpense: { id: string; code: '5003' };
    otherExpense: { id: string; code: '5099' };
  };
  holidays: Date[]; // Known holiday dates for schedule testing
  settings: {
    holidayCalendar: Date[];
    defaultPenaltyGraceDays: number;
    maxPageSize: number;
  };
}
```

### Factory Default Values

```typescript
const CUSTOMER_DEFAULTS = {
  fullName: 'Test Customer',
  fatherOrHusbandName: 'Test Father',
  mobile: '9876543210',        // Unique per test via suffix
  aadhaarNumber: '234567890123',
  gender: 'male',
  addressLine1: '123 Test Street',
  city: 'TestCity',
  district: 'TestDistrict',
  state: 'TestState',
  pincode: '123456',
};

const FAMILY_MEMBER_DEFAULTS = {
  name: 'Test Family Member',
  relationship: 'spouse',
  contactNumber: '9876543211',
};

const GUARANTOR_DEFAULTS = {
  name: 'Test Guarantor',
  relationship: 'friend',
  mobile: '9876543212',
  aadhaarNumber: '345678901234',
  address: '456 Guarantor Street, TestCity',
};

const LOAN_DEFAULTS = {
  principalPaise: 10_000_00, // ₹10,000
  tenureMonths: 12,
  purpose: 'E2E test loan',
};

const COLLECTION_DEFAULTS = {
  paymentMode: 'cash',
  paymentDate: '2024-01-15',
};

const USER_DEFAULTS = {
  fullName: 'Test User',
  mobile: '9876543299',
  role: 'field_officer',
  password: 'TestPass123',
};
```

## Authentication E2E Test Architecture (GAP 1)

### Test Coverage

The auth E2E test suite (`auth.e2e.spec.ts`) covers the complete authentication lifecycle:

```mermaid
graph LR
    A[Login] --> B[Access Token]
    B --> C[API Requests]
    B --> D[Token Expiry]
    D --> E[Refresh Token]
    E --> F[New Access Token]
    A --> G[Failed Login]
    G --> H[Increment Counter]
    H --> I{5 Attempts?}
    I -->|Yes| J[Account Lockout 15min]
    I -->|No| G
    K[Password Change] --> L[Invalidate All Sessions]
    M[Logout] --> N[Revoke Refresh Token]
```

**Test Scenarios:**
1. Successful login returns access token, refresh token, and user profile
2. Login with invalid credentials returns 401 with INVALID_CREDENTIALS code
3. Login with inactive user returns 401
4. Account lockout after 5 consecutive failed login attempts (verify `locked_until` in DB)
5. Locked account rejects login even with correct credentials until lockout expires
6. Refresh token rotation: old token revoked, new token issued
7. Refresh with revoked/expired token returns 401
8. Logout revokes all refresh tokens for the user (verify in DB)
9. Password change invalidates all existing sessions (all refresh tokens revoked)
10. Password change with incorrect current password returns error
11. JWT with tampered payload returns 401
12. Expired JWT returns 401

## User Management E2E Test Architecture (GAP 2)

### Test Coverage

The user management E2E test suite (`user-management.e2e.spec.ts`) covers:

1. Super admin creates a new user with role assignment → verify user persisted in DB
2. Manager creates a new user → verify only allowed roles can be assigned
3. User update (name, mobile, email) → verify optimistic locking with version field
4. Role change → verify audit log entry with before/after role
5. Area assignment for field officer → verify `user_area_assignments` record
6. Area assignment for collection officer → verify scope enforcement on subsequent queries
7. Deactivate user → verify `is_active = false`, login rejected
8. Unauthorized role (field_officer) attempting user creation → 403

## Notification Outbox E2E Test Architecture (GAP 3)

### Test Coverage

The notification outbox E2E test suite (`notification-outbox.e2e.spec.ts`) covers:

```mermaid
graph TD
    A[Finance Operation] -->|Within TX| B[Outbox Message Created]
    B --> C{SMS Provider}
    C -->|Success| D[Status: sent]
    C -->|Failure| E[Status: failed]
    E --> F{Retry Count < Max?}
    F -->|Yes| G[Exponential Backoff]
    G --> C
    F -->|No| H[Status: dead_letter]
    I[Manual Retry] --> B
```

**Test Scenarios:**
1. Collection posting creates outbox message within the same transaction
2. Disbursement creates outbox message within the same transaction
3. SMS provider failure does NOT roll back the finance transaction (critical invariant)
4. Failed message retries with exponential backoff (30s, 2min, 8min)
5. Message moves to dead_letter after max retries exhausted
6. Manual retry resets dead_letter message to pending
7. Outbox message contains correct template variables (customer name, amount, loan number)
8. Batch processing with `FOR UPDATE SKIP LOCKED` prevents duplicate processing

**Critical Invariant Test:**
```typescript
// Verify SMS failure isolation: finance TX commits even when SMS fails
it('SMS provider failure does not roll back collection transaction', async () => {
  // 1. Post a valid collection (outbox message enqueued in same TX)
  // 2. Verify collection record exists in DB
  // 3. Verify journal entries exist
  // 4. Verify receipt exists
  // 5. Simulate SMS send failure on the outbox message
  // 6. Verify collection, journal, receipt are NOT rolled back
  // 7. Verify outbox message status is 'failed' (not 'pending')
});
```

## Report Module E2E Test Architecture (GAP 4)

### Test Coverage

The report E2E test suite (`report.e2e.spec.ts`) covers all 20+ report types:

**Report Types:**
- `collection-daily`, `collection-officer-wise`, `collection-product-wise`
- `disbursement-daily`, `disbursement-summary`
- `outstanding-summary`, `outstanding-officer-wise`, `outstanding-product-wise`
- `overdue-summary`, `overdue-aging`, `overdue-officer-wise`
- `loan-portfolio`, `loan-status-summary`
- `penalty-summary`, `penalty-waiver`
- `cashbook-daily`, `cashbook-summary`
- `trial-balance`, `profit-and-loss`, `balance-sheet`, `daybook`
- `group-collection-summary`, `group-delinquency`

**Test Scenarios:**
1. Each report type returns 200 with valid data structure
2. RBAC scope filtering: field_officer sees only their assigned area data
3. RBAC scope filtering: collection_officer sees only their assigned route data
4. Manager sees all data (no scope restriction)
5. viewer_auditor has read access to all reports
6. Export endpoint returns format metadata for PDF, XLSX, CSV
7. Rate limiting: 6th report request within 1 minute returns 429
8. Unknown report type returns 404
9. Date range filtering works correctly (startDate, endDate, asOfDate)
10. Report data matches known seeded test data for verification

## Settings and Holiday Calendar E2E Test Architecture (GAP 5)

### Test Coverage

The settings E2E test suite (`settings-holiday.e2e.spec.ts`) covers:

1. Super admin reads system settings → verify response structure
2. Super admin updates a setting → verify persistence and audit log
3. Manager reads settings (allowed) → 200
4. Field officer reads settings (denied) → 403
5. Holiday calendar CRUD: add holiday date, remove holiday date
6. Holiday calendar effect: create a loan with a due date that falls on a newly added holiday → verify due date shifts to next business day
7. Settings update with invalid value → 400 validation error

## Audit Log E2E Test Architecture (GAP 6)

### Test Coverage

The audit log E2E test suite (`audit-log.e2e.spec.ts`) covers:

1. Query audit logs by target entity and ID → verify correct entries returned
2. Query audit logs by action type → verify filtering works
3. Query audit logs by actor → verify filtering works
4. Query audit logs by date range → verify filtering works
5. Audit log pagination → verify correct page size and ordering
6. Append-only enforcement: attempt to DELETE from audit_logs via any API → verify rejection
7. Append-only enforcement: attempt to UPDATE audit_logs via any API → verify rejection
8. Verify audit log entry structure: action_type, actor_id, actor_role, target_entity, target_id, timestamp, ip_address, request_id, before_state, after_state
9. viewer_auditor can read audit logs → 200
10. field_officer cannot read audit logs → 403

## Health Check E2E Test Architecture (GAP 7)

### Test Coverage

The health check E2E test suite (`health-check.e2e.spec.ts`) covers:

1. `GET /health/live` returns 200 with `{ status: 'ok' }` — no auth required
2. `GET /health/ready` returns 200 when DB is connected and migrations are current
3. `GET /health/ready` includes database connectivity check
4. Health endpoints do not require JWT authentication
5. Health endpoints respond within acceptable latency (<500ms)

## Playwright Test Architecture (GAP 8)

### Page Object Pattern

Playwright tests use a lightweight page object pattern for maintainability:

```typescript
// Example: LoginPage
class LoginPage {
  constructor(private page: Page) {}

  async goto() { await this.page.goto('/login'); }
  async fillUsername(username: string) { await this.page.fill('[data-testid="username"]', username); }
  async fillPassword(password: string) { await this.page.fill('[data-testid="password"]', password); }
  async submit() { await this.page.click('[data-testid="login-submit"]'); }
  async getErrorMessage() { return this.page.textContent('[data-testid="login-error"]'); }
  async waitForDashboard() { await this.page.waitForURL('/dashboard'); }
}
```

### Playwright Test Scenarios

**Login Flow (`login.playwright.spec.ts`):**
1. Successful login redirects to dashboard
2. Invalid credentials shows error message
3. Account lockout shows lockout message after 5 failed attempts
4. Login form validates required fields before submission

**Customer Onboarding (`customer-onboarding.playwright.spec.ts`):**
1. Fill customer form with valid data → submit → verify success toast
2. Aadhaar validation error shown inline for invalid format
3. PAN validation error shown inline for invalid format
4. KYC document upload with valid file → verify upload success
5. KYC document upload with invalid MIME type → verify error message
6. Duplicate Aadhaar detection → verify warning dialog

**Loan Application (`loan-application.playwright.spec.ts`):**
1. Create loan application → verify draft status badge
2. Submit loan → verify status changes to submitted
3. Approve loan (as manager) → verify maker-checker enforcement

**Collection Posting (`collection-posting.playwright.spec.ts`):**
1. Post collection via form → verify success and receipt display
2. Confirmation dialog appears before finance action submission
3. Receipt print view renders correctly with all components

**Dashboard (`dashboard.playwright.spec.ts`):**
1. Dashboard loads with KPI cards (total outstanding, collections today, overdue count)
2. KPI values match expected data from seeded test state
3. Overdue loans highlighted with correct status badges

**Receipt Print View (`receipt-print.playwright.spec.ts`):**
1. Receipt page renders with customer name, loan number, amount, date, components
2. Print layout is correct (no navigation elements, proper formatting)

**Mobile Responsive (`mobile-responsive.playwright.spec.ts`):**
1. Collection form is usable on mobile viewport (Pixel 5)
2. Touch targets are sufficiently large (min 44x44px)
3. Navigation menu collapses to hamburger on mobile

**Confirmation Dialogs (`confirmation-dialogs.playwright.spec.ts`):**
1. Disbursement action shows confirmation dialog
2. Collection posting shows confirmation dialog
3. Reversal action shows confirmation dialog with reason field
4. Cancel on confirmation dialog does not submit the action

## Full Business Flow E2E Tests (GAP 9)

### Test Coverage

The business flows E2E test suite (`business-flows.e2e.spec.ts`) covers complete end-to-end scenarios spanning multiple modules:

**Flow 1: Happy Path — Full Loan Lifecycle**
```
Customer creation → Loan application → Submit → Review → Approve →
Disbursement → Pay all EMIs sequentially → Verify outstanding = 0 →
Loan closure → Verify final state
```

**Flow 2: Partial Payment → Overdue → Penalty → Collection**
```
Disbursed loan → Pay partial first EMI → Advance time past due date →
Verify overdue status and DPD → Post penalty → Pay remaining + penalty →
Verify status returns to active
```

**Flow 3: Group Lending Flow**
```
Create 5 customers → Create group with leader → Create individual loans →
Post group collection with member-wise breakdown → Verify individual receipts →
Verify individual loan outstanding updates
```

**Flow 4: Reversal + Re-collection Flow**
```
Post collection → Verify receipt and ledger → Reverse collection →
Verify compensating entries and receipt marked reversed →
Re-post correct collection → Verify new receipt and updated outstanding
```

**Flow 5: Foreclosure Flow**
```
Disbursed loan with 3 EMIs paid → Request foreclosure quote →
Verify settlement components → Approve foreclosure (maker-checker) →
Post settlement payment → Verify loan status = foreclosed →
Verify all installments closed → Verify ledger entries
```

**Flow 6: Customer Blacklist → Reinstatement Flow (GAP 18)**
```
Create customer → Create and disburse loan → Blacklist customer →
Verify new loan application rejected → Reinstate customer (manager) →
Verify new loan application accepted → Verify audit trail for both actions
```

**Flow 7: Advance Payment Flow (GAP 14, 23)**
```
Disbursed loan with 12 installments → Pay 3x EMI amount →
Verify first 3 installments fully paid → Verify allocation to future installments
in chronological order → Verify outstanding reduced by full payment amount
```


## Concurrency Test Architecture Detail (GAP 10)

### Implementation Strategy

Concurrency tests use `Promise.all` to fire simultaneous HTTP requests against the live API, relying on real PostgreSQL locking and constraint enforcement.

```typescript
// Pattern: Fire N concurrent requests and verify outcomes
async function concurrentRequests<T>(
  count: number,
  requestFn: (index: number) => Promise<T>,
): Promise<PromiseSettledResult<T>[]> {
  const promises = Array.from({ length: count }, (_, i) => requestFn(i));
  return Promise.allSettled(promises);
}
```

### Test Scenarios

**Double-Click Payment Submit (Idempotency):**
```typescript
it('concurrent collection posts with same idempotency key produce exactly one record', async () => {
  const idempotencyKey = randomUUID();
  const results = await concurrentRequests(5, () =>
    clients.collectionOfficer.post('/collections').send({
      loanId, amountPaise: 1000_00, paymentMode: 'cash',
      paymentDate: '2024-01-15', idempotencyKey,
    })
  );
  // Exactly one 201, rest are 200 (idempotent return) or 409
  const created = results.filter(r => r.status === 'fulfilled' && r.value.status === 201);
  expect(created).toHaveLength(1);
  // Verify only one collection record in DB
  const collections = await dbUtils.findCollectionsByIdempotencyKey(idempotencyKey);
  expect(collections).toHaveLength(1);
});
```

**Concurrent Collection on Same Loan:**
- Fire 3 different collections (different idempotency keys) on the same loan simultaneously
- Verify all succeed or some fail with optimistic locking conflict
- Verify outstanding balance is correct after all successful collections

**Concurrent Loan Approval/Disbursement:**
- Two managers attempt to approve the same loan simultaneously
- Verify exactly one succeeds, the other gets a conflict error
- Verify loan status is consistent

**Receipt Number Collision Under Load:**
- Fire 10 concurrent collections on different loans
- Verify all receipt numbers are unique and sequential
- No gaps or duplicates in receipt number sequence

**Stale Version Optimistic Locking:**
```typescript
it('stale version update is rejected with CONFLICT_OPTIMISTIC_LOCK', async () => {
  // 1. Read customer with version=1
  // 2. Update customer (version becomes 2)
  // 3. Attempt update with version=1 → expect 409 CONFLICT_OPTIMISTIC_LOCK
});
```

**Database-Level Locking Verification:**
- Verify that `SELECT ... FOR UPDATE` is used for critical finance operations
- Concurrent reversal attempts on the same collection → exactly one succeeds

## Security Test Architecture Detail (GAP 11)

### RBAC Matrix Exhaustive Testing

The security test suite systematically tests all 7 roles against all permission-protected endpoints:

```typescript
// RBAC matrix: role × endpoint × expected status
const RBAC_MATRIX: Array<{
  endpoint: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  allowedRoles: UserRole[];
  description: string;
}> = [
  { endpoint: '/customers', method: 'POST', allowedRoles: ['super_admin', 'manager', 'field_officer', 'office_staff'], description: 'Create customer' },
  { endpoint: '/customers', method: 'GET', allowedRoles: ALL_ROLES, description: 'List customers' },
  { endpoint: '/loans/:id/approve', method: 'POST', allowedRoles: ['super_admin', 'manager'], description: 'Approve loan' },
  { endpoint: '/collections', method: 'POST', allowedRoles: ['super_admin', 'manager', 'collection_officer'], description: 'Post collection' },
  { endpoint: '/collections/:id/reverse', method: 'POST', allowedRoles: ['super_admin', 'manager'], description: 'Reverse collection' },
  { endpoint: '/reports/:type', method: 'GET', allowedRoles: ['super_admin', 'manager', 'field_officer', 'collection_officer', 'accountant', 'viewer_auditor'], description: 'View report' },
  { endpoint: '/reports/:type/export', method: 'GET', allowedRoles: ['super_admin', 'manager', 'accountant'], description: 'Export report' },
  { endpoint: '/users', method: 'POST', allowedRoles: ['super_admin', 'manager'], description: 'Create user' },
  { endpoint: '/settings', method: 'PATCH', allowedRoles: ['super_admin'], description: 'Update settings' },
  { endpoint: '/audit', method: 'GET', allowedRoles: ['super_admin', 'manager', 'viewer_auditor'], description: 'View audit logs' },
  // ... all other endpoints from PERMISSIONS constant
];

// Test: for each endpoint, verify allowed roles get 2xx and denied roles get 403
for (const entry of RBAC_MATRIX) {
  for (const role of ALL_ROLES) {
    const expected = entry.allowedRoles.includes(role) ? 'allowed' : 'denied';
    it(`${entry.description}: ${role} should be ${expected}`, async () => { /* ... */ });
  }
}
```

### IDOR Testing Methodology

```typescript
// Pattern: User A creates a resource, User B (same role, different scope) tries to access it
it('collection officer cannot access loans outside their assigned area', async () => {
  // 1. Assign officer1 to area "North"
  // 2. Create customer and loan in area "North"
  // 3. Assign officer2 to area "South"
  // 4. officer2 attempts GET /loans/:id → expect 403 or filtered out
});
```

### JWT Security Tests

1. **Tampered JWT**: Modify payload (change role from field_officer to super_admin), re-sign with wrong secret → 401
2. **Expired JWT**: Use a token with `exp` in the past → 401
3. **Missing JWT**: Request without Authorization header → 401
4. **Malformed JWT**: Send `Authorization: Bearer not-a-jwt` → 401
5. **JWT with non-existent user**: Valid signature but `sub` points to deleted user → 401

### SQL Injection Resistance

```typescript
// Prisma parameterization prevents SQL injection, but verify explicitly
const SQL_PAYLOADS = [
  "'; DROP TABLE users; --",
  "1 OR 1=1",
  "' UNION SELECT * FROM users --",
  "1; DELETE FROM loans",
];

for (const payload of SQL_PAYLOADS) {
  it(`rejects SQL injection payload: ${payload.substring(0, 30)}...`, async () => {
    const res = await clients.fieldOfficer.get(`/customers?search=${encodeURIComponent(payload)}`);
    expect(res.status).not.toBe(500); // Should not cause server error
    // Verify no data leaked or modified
  });
}
```

### Rate Limiting Verification

```typescript
it('auth endpoint rate limited to 10 requests per minute', async () => {
  const requests = Array.from({ length: 12 }, () =>
    clients.unauthenticated.post('/auth/login').send({ username: 'test', password: 'wrong' })
  );
  const results = await Promise.all(requests);
  const rateLimited = results.filter(r => r.status === 429);
  expect(rateLimited.length).toBeGreaterThan(0);
});

it('report generation rate limited to 5 per minute', async () => {
  const requests = Array.from({ length: 7 }, () =>
    clients.manager.get('/reports/collection-daily')
  );
  const results = await Promise.all(requests);
  const rateLimited = results.filter(r => r.status === 429);
  expect(rateLimited.length).toBeGreaterThan(0);
});
```

### Error Response Sanitization

```typescript
it('error responses do not leak stack traces or internal paths', async () => {
  const res = await clients.fieldOfficer.get('/loans/non-existent-uuid');
  expect(res.body).not.toHaveProperty('stack');
  expect(JSON.stringify(res.body)).not.toMatch(/node_modules/);
  expect(JSON.stringify(res.body)).not.toMatch(/\.ts:/);
  expect(res.body).toHaveProperty('requestId');
  expect(res.body).toHaveProperty('error');
});
```

## Negative Test Comprehensive Coverage (GAP 12)

### Boundary Value Testing

```typescript
// For all numeric fields, test min-1 and max+1
const BOUNDARY_TESTS = [
  { field: 'principalPaise', min: 5_000_00, max: 50_000_00 },
  { field: 'tenureMonths', min: 3, max: 36 },
  { field: 'annualRateBps', min: 600, max: 3600 },
];

for (const { field, min, max } of BOUNDARY_TESTS) {
  it(`rejects ${field} = ${min - 1} (below minimum)`, async () => { /* ... */ });
  it(`rejects ${field} = ${max + 1} (above maximum)`, async () => { /* ... */ });
  it(`accepts ${field} = ${min} (at minimum)`, async () => { /* ... */ });
  it(`accepts ${field} = ${max} (at maximum)`, async () => { /* ... */ });
}
```

### Empty/Null/Undefined Field Testing

- Submit customer with empty `fullName` → 400
- Submit customer with null `mobile` → 400
- Submit loan with undefined `purpose` → 400
- Submit collection with `amountPaise: 0` → 400
- Submit collection with negative `amountPaise` → 400

### XSS Payload Testing

```typescript
const XSS_PAYLOADS = [
  '<script>alert("xss")</script>',
  '"><img src=x onerror=alert(1)>',
  "javascript:alert('xss')",
  '<svg onload=alert(1)>',
];

for (const payload of XSS_PAYLOADS) {
  it(`sanitizes XSS payload in customer name: ${payload.substring(0, 20)}...`, async () => {
    // Submit customer with XSS in fullName
    // Verify stored value is sanitized or escaped
    // Verify API response does not contain executable script
  });
}
```

### Unicode/Special Character Handling

- Customer name with Hindi characters (e.g., "राम कुमार") → accepted and persisted correctly
- Customer name with emoji → handled gracefully (accepted or rejected with clear error)
- Address with special characters (e.g., "123/A, M.G. Road") → accepted

### Maximum Pagination Size Enforcement

```typescript
it('enforces maximum page size of 100', async () => {
  const res = await clients.manager.get('/customers?take=500');
  expect(res.body.data.length).toBeLessThanOrEqual(100);
});
```

### Stale Version Optimistic Locking

```typescript
it('rejects update with stale version number', async () => {
  const customer = await factories.createCustomer(clients.fieldOfficer);
  // Update once (version 1 → 2)
  await clients.fieldOfficer.patch(`/customers/${customer.id}`).send({ fullName: 'Updated', version: 1 });
  // Attempt update with stale version 1 → expect 409
  const res = await clients.fieldOfficer.patch(`/customers/${customer.id}`).send({ fullName: 'Stale', version: 1 });
  expect(res.status).toBe(409);
  expect(res.body.code).toBe('CONFLICT_OPTIMISTIC_LOCK');
});
```

## Environment Variable Validation Test (GAP 21)

### Test Coverage (`env-validation.e2e.spec.ts`)

Tests the Zod-based startup validator (`apps/api/src/config/env.validation.ts`):

1. Valid environment passes validation → returns parsed config
2. Missing `DATABASE_URL` → validation fails with descriptive error
3. Missing `JWT_SECRET` → validation fails
4. `JWT_SECRET` shorter than 16 characters → validation fails
5. Invalid `DATABASE_URL` (not a URL) → validation fails
6. Invalid `NODE_ENV` value → validation fails
7. Default values applied correctly (`PORT=3001`, `JWT_EXPIRY=15m`, `S3_BUCKET=as-finance-docs`)
8. Optional fields (`S3_ENDPOINT`, `SMS_API_KEY`) can be omitted without failure

## Request ID Propagation Test (GAP 22)

### Test Coverage (`request-id.e2e.spec.ts`)

1. Request without `x-request-id` header → response includes a generated UUID in `x-request-id`
2. Request with `x-request-id: custom-123` → response echoes back `x-request-id: custom-123`
3. Error responses include the `requestId` field matching the `x-request-id` header
4. Audit log entries created during the request contain the same `request_id` value
5. Multiple concurrent requests each get their own isolated request ID (no cross-contamination)

## Family Member and Guarantor Test Coverage (GAP 19)

### Test Coverage (`family-guarantor.e2e.spec.ts`)

1. Add family member to customer → verify persisted with correct relationship
2. Add multiple family members → verify all returned in customer detail
3. Add guarantor with valid Aadhaar → verify persisted with encrypted Aadhaar
4. Add guarantor with invalid Aadhaar format → 400 validation error
5. Add guarantor with photo upload → verify file stored in MinIO
6. List guarantors for customer → verify correct data returned
7. Guarantor Aadhaar masked in API response (last 4 digits only)


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Schedule Reconciliation

*For all* valid loan parameters (principal in paise, annual rate in basis points, tenure in months, interest type flat or reducing_balance, frequency), the generated EMI schedule SHALL satisfy: `sum(installment[i].principal_paise) == principal_paise` AND `sum(installment[i].interest_paise) == total_interest_paise`, with any rounding difference confined to the last installment only.

**Validates: Requirements 4.1, 4.2, 4.3**

### Property 2: Schedule Determinism

*For all* valid schedule generation inputs (principal, rate, tenure, start date, frequency, interest type, holiday calendar), generating the schedule twice with identical inputs SHALL produce byte-identical installment records when serialized to JSON.

**Validates: Requirements 4.4**

### Property 3: Due Date Holiday Avoidance

*For all* valid start dates, frequencies, and holiday calendars, no generated due date SHALL fall on a date present in the holiday calendar. Each holiday-shifted date SHALL be the next calendar day not in the holiday set, and adjusted dates SHALL always be >= the original calculated date.

**Validates: Requirements 4.5**

### Property 4: Allocation Preservation

*For all* valid collection amounts and loan states (installments with outstanding balances and pending penalties), the allocation engine SHALL satisfy: `sum(penalty_allocated) + sum(interest_allocated) + sum(principal_allocated) + excess == collection_amount_paise`. No money is created or lost during allocation, and all individual allocation line amounts are non-negative.

**Validates: Requirements 6.3**

### Property 5: Allocation Order Correctness

*For all* valid partial or full payments against a loan with outstanding penalties, interest, and principal, the allocation engine SHALL allocate in the order: penalty (oldest first) → interest (oldest due date first) → principal (oldest due date first). No principal SHALL be allocated while interest remains unpaid on the same or older installment, and no interest SHALL be allocated while penalties remain unpaid.

**Validates: Requirements 6.2**

### Property 6: Outstanding Balance Invariant

*For all* valid payment sequences applied to a loan via the live API, the loan's `cached_outstanding_paise` SHALL equal `total_payable_paise − sum_of_all_valid_allocated_payments` after each collection. Outstanding SHALL never become negative.

**Validates: Requirements 6.9, 6.10**

### Property 7: Reversal Ledger Neutrality

*For all* valid collection reversals executed via the live API, the net ledger effect of the original collection's journal entry plus the reversal's compensating journal entry SHALL be zero. Querying `journal_lines` for both entries SHALL show that for each account, `sum(debit_paise) == sum(credit_paise)`.

**Validates: Requirements 7.2, 12.4**

### Property 8: Journal Entry Balance

*For all* journal entries created in the system (via disbursement, collection, reversal, penalty, expense, or processing fee), `sum(debit_paise) == sum(credit_paise)` across all journal lines for each entry. Any attempt to create an unbalanced entry SHALL be rejected before persistence.

**Validates: Requirements 12.1**

### Property 9: Trial Balance Identity

*For all* sequences of balanced journal entries posted to the system, the trial balance SHALL satisfy: `sum(all_debit_balances) == sum(all_credit_balances)` across all accounts in the chart of accounts.

**Validates: Requirements 12.6**

### Property 10: Idempotency Consistency

*For all* finance operations that accept an idempotency key (disbursement, collection, reversal, group collection), submitting the same request with the same idempotency key twice SHALL return the same response body without creating duplicate records in any table (collections, disbursements, journal_entries, receipts, audit_logs).

**Validates: Requirements 5.5, 6.5**

### Property 11: Loan State Machine Correctness

*For all* pairs of (current_status, target_status) in the loan lifecycle, the system SHALL accept the transition if and only if it follows the valid transition graph: draft→submitted→under_review→approved→disbursed→active→closed, with branches under_review→rejected, active→overdue→defaulted, and active/overdue→foreclosed. All other transitions SHALL be rejected with INVALID_STATUS_TRANSITION.

**Validates: Requirements 3.3, 3.5**

### Property 12: Input Validation Rejection

*For all* customer registration payloads with invalid Aadhaar format (not exactly 12 digits) or invalid PAN format (not matching AAAAA9999A pattern), the API SHALL reject with 400 status. *For all* loan product configurations with out-of-range values (negative rate, zero principal range, tenure min > max), the API SHALL reject with 400 status.

**Validates: Requirements 1.2, 2.5**

### Property 13: Aadhaar Masking in API Responses

*For all* API responses that include customer data with an Aadhaar number, the Aadhaar SHALL be masked to show only the last 4 digits in the format XXXX-XXXX-NNNN. The full Aadhaar number SHALL never appear in any API response body.

**Validates: Requirements 1.8**

### Property 14: DPD and Overdue Bucket Classification

*For all* loans with unpaid installments past their due date, the DPD SHALL equal the calendar days since the earliest unpaid installment due date. The overdue_bucket SHALL be correctly classified: bucket_1_30 for 1–30 DPD, bucket_31_60 for 31–60 DPD, bucket_61_90 for 61–90 DPD, bucket_90_plus for 90+ DPD.

**Validates: Requirements 8.1, 8.2**

### Property 15: Foreclosure Settlement Calculation

*For all* valid active or overdue loans, the foreclosure settlement amount SHALL equal: `outstanding_principal_paise + accrued_interest_paise + pending_penalties_paise − rebate_paise`, with each component explicitly itemized. The settlement amount SHALL never be negative (clamped to zero if rebate exceeds total).

**Validates: Requirements 9.1**

### Property 16: Group Collection Sum Validation

*For all* group collection requests, the system SHALL validate that the sum of all member-wise breakdown amounts equals the declared total amount exactly. If the sum does not match, the request SHALL be rejected with a typed error showing the discrepancy.

**Validates: Requirements 11.3, 11.4**

### Property 17: Audit Trail Completeness

*For all* finance-affecting mutations (customer create/update, collection, reversal, disbursement, penalty posting, expense recording, foreclosure, blacklisting, reinstatement, password change), the system SHALL create an audit_log entry with actor identity, target entity, action type, and timestamp. No finance mutation SHALL complete without a corresponding audit record.

**Validates: Requirements 1.6, 7.6**

### Property 18: Processing Fee Calculation

*For all* valid principal amounts and processing fee configurations (fixed paise or percentage basis points), the calculated fee SHALL be: fixed fee as exact paise amount, or percentage fee as `ROUND_HALF_UP(principal_paise × fee_bps / 10000)`. A fee journal entry SHALL be created only when the calculated fee is greater than zero.

**Validates: Requirements 5.6**

### Property 19: Loan Number Format and Uniqueness

*For all* loans created via the API, the loan number SHALL follow the format LN-YYYY-NNNNN (where YYYY is the current year and NNNNN is a zero-padded sequential number). No two loans SHALL share the same loan number, even under concurrent creation.

**Validates: Requirements 3.1, 3.7**

### Property 20: Collection Against Invalid Loan Status Rejected

*For all* loans in status closed, defaulted, foreclosed, or rejected, any collection attempt SHALL be rejected with a typed error code indicating the loan status. No collection record, journal entry, or receipt SHALL be created.

**Validates: Requirements 6.8**

### Property 21: No Orphaned Journal Entries

*For all* journal entries in the database, there SHALL exist a valid source reference (disbursement, collection, reversal, penalty, expense, processing fee, or foreclosure) that created the entry. No journal entry SHALL exist without a traceable source.

**Validates: Requirements 12.7**

### Property 22: Journal Entry and Receipt Immutability

*For all* posted journal entries and receipts, no UPDATE or DELETE operation SHALL succeed via the API. The service and repository layers SHALL expose no mutation methods for these entities. Corrections happen only via new compensating entries.

**Validates: Requirements 12.5, 6.6**

### Property 23: Approved Loan Term Immutability

*For all* loans in approved, disbursed, active, or any post-approval status, attempts to modify loan terms (principal, tenure, product version) via PATCH /loans/:id SHALL be rejected with a typed error.

**Validates: Requirements 3.6**

### Property 24: Advance Payment Allocation to Future Installments

*For all* collection amounts that exceed the total current and overdue dues on a loan, the allocation engine SHALL allocate the excess to future installments in strict chronological order (earliest due date first). After allocation, each future installment's paid amounts SHALL not exceed its due amounts, and the total allocated across all installments SHALL equal the collection amount.

**Validates: Requirements 6.6 (advance payments)**

### Property 25: Receipt Number Sequentiality

*For all* pairs of receipts (R1, R2) where R1 was created before R2 (R1.created_at < R2.created_at), the receipt number of R1 SHALL be strictly less than the receipt number of R2 when compared as sequential identifiers. No gaps SHALL exist in the receipt number sequence within a single test run.

**Validates: Requirements 6.6 (receipt sequencing)**

### Property 26: Cashbook Reconciliation

*For all* date ranges queried against the cashbook, the closing balance SHALL equal: `opening_balance + sum(inflows) − sum(outflows)`. Inflows include collections and handover-ins; outflows include disbursements, expenses, and handover-outs. The cashbook balance SHALL never silently drift from the sum of its constituent transactions.

**Validates: Requirements 13.1, 13.2**

### Property 27: Penalty Duplicate Prevention

*For all* attempts to post a penalty with the same (loan_id, installment_id, penalty_period) combination as an existing penalty, the system SHALL reject the request with a DUPLICATE_PENALTY error. No duplicate penalty records SHALL exist in the database.

**Validates: Requirements 8.4**

### Property 28: Audit Log Append-Only Enforcement

*For all* audit log entries in the database, no API endpoint or service method SHALL allow UPDATE or DELETE operations on the audit_logs table. Audit logs are immutable after creation. Any attempt to modify or delete an audit log entry SHALL be rejected.

**Validates: Requirements (audit log immutability from security-compliance steering)**

### Property 29: SMS Failure Finance Isolation

*For all* finance operations that enqueue an outbox SMS message (collection, disbursement, penalty), if the SMS delivery fails (provider error, timeout, dead-letter), the finance transaction (collection record, journal entries, receipt, outstanding update) SHALL remain committed and unaffected. SMS failure SHALL never cause a finance transaction rollback.

**Validates: Requirements (notification isolation from tech steering)**

### Property 30: Request ID Propagation

*For all* HTTP requests to the API, the response SHALL include an `x-request-id` header. If the request includes an `x-request-id` header, the response SHALL echo the same value. If the request does not include the header, the response SHALL contain a newly generated UUID. Any audit log entries created during the request SHALL contain the same request_id value.

**Validates: Requirements (request ID middleware)**

### Property 31: RBAC Matrix Exhaustive Coverage

*For all* combinations of (user_role, permission_key) defined in the PERMISSIONS constant, the API SHALL return 2xx for allowed roles and 403 for denied roles. The RBAC guard SHALL enforce the permission matrix consistently across all protected endpoints.

**Validates: Requirements (RBAC from security-compliance steering)**

### Property 32: Group Size Constraint Enforcement

*For all* group creation or member addition requests, the system SHALL enforce minimum 5 members and maximum 15 members. Requests that would result in a group size outside these bounds SHALL be rejected with a descriptive error.

**Validates: Requirements 11.2**

### Property 33: Notification Outbox Retry Backoff

*For all* failed outbox messages with retry_count < max_retries, the next_retry_at SHALL be calculated using exponential backoff: `30 × 4^retry_count` seconds from the current time. After max_retries is reached, the message status SHALL transition to dead_letter.

**Validates: Requirements (notification retry from tech steering)**

### Property 34: Report RBAC Scope Filtering

*For all* report queries executed by a scoped role (field_officer, collection_officer), the returned data SHALL contain only records within the user's assigned area. No records from other areas SHALL appear in the report results. Manager and super_admin roles SHALL see unfiltered data.

**Validates: Requirements (report RBAC scoping)**

### Property 35: Account Lockout After Failed Attempts

*For all* user accounts, after 5 consecutive failed login attempts, the account SHALL be locked for 15 minutes. During the lockout period, even correct credentials SHALL be rejected with ACCOUNT_LOCKED. After the lockout period expires, login with correct credentials SHALL succeed and reset the failed attempt counter.

**Validates: Requirements (auth lockout from security-compliance steering)**


## Error Handling

### Error Response Format

All API errors follow a consistent JSON structure enforced by the Global Exception Filter:

```typescript
interface ErrorResponse {
  statusCode: number;        // HTTP status code
  error: string;             // Error type (e.g., 'BUSINESS_RULE_ERROR')
  message: string;           // Human-readable description
  code?: string;             // Typed error code (e.g., 'INVALID_STATUS_TRANSITION')
  details?: unknown;         // Additional context (e.g., unmet prerequisites list)
  requestId: string;         // Correlation ID from x-request-id header
  timestamp: string;         // ISO 8601 timestamp
}
```

### Error Categories Tested

| Category | HTTP Status | Error Codes | Test Coverage |
|---|---|---|---|
| Validation | 400 | VALIDATION_ERROR | Invalid Aadhaar/PAN, out-of-range product values, invalid MIME type, empty fields, boundary values, XSS payloads |
| Business Rule | 400/422 | INVALID_STATUS_TRANSITION, COLLECTION_EXCEEDS_OUTSTANDING, CLOSURE_PREREQUISITES_NOT_MET, ALREADY_DISBURSED, MAKER_CHECKER_VIOLATION, CUSTOMER_BLACKLISTED, LOAN_NOT_APPROVED, SCHEDULE_NOT_GENERATED, KYC_DOCS_MISSING, QUOTE_EXPIRED | State machine, over-collection, closure, disbursement, approval, blacklist, foreclosure |
| Not Found | 404 | ENTITY_NOT_FOUND | Non-existent loan, customer, collection, report type |
| Conflict | 409 | DUPLICATE_ENTITY, CONFLICT_OPTIMISTIC_LOCK, DUPLICATE_PENALTY, ALREADY_REVERSED | Duplicate Aadhaar/mobile, stale version, duplicate penalty period, double reversal |
| Auth | 401 | UNAUTHORIZED, INVALID_CREDENTIALS, INVALID_REFRESH_TOKEN, ACCOUNT_LOCKED, ACCOUNT_INACTIVE | Missing/expired/tampered JWT, wrong password, locked account |
| Forbidden | 403 | FORBIDDEN, INSUFFICIENT_PERMISSION | Wrong role, IDOR attempt, scope violation |
| Rate Limited | 429 | RATE_LIMITED | Auth endpoint (10/min), report generation (5/min), file upload (20/min) |

### Test Strategy for Errors

- **Negative tests** verify that each error category returns the correct HTTP status, error code, and descriptive message
- **E2E tests** verify that errors leave no partial state in the database (transaction rollback)
- **Security tests** verify that auth/RBAC errors don't leak internal information (no stack traces, no SQL, no file paths)
- **Concurrency tests** verify that conflict errors (optimistic locking, idempotency) are handled correctly
- **Error response sanitization** verified: no PII in error responses, no internal paths, requestId always present

## Testing Strategy

### Test Framework Configuration

**Vitest E2E Configuration** (`apps/api/test/vitest.e2e.config.ts`):
- **Test runner**: Vitest with `--run` flag (no watch mode)
- **Pool**: `forks` with `maxForks: 1` for sequential DB-dependent execution
- **Test timeout**: 30s per test, 60s for setup/teardown hooks
- **Global setup**: `test/setup/global-setup.ts` for DB verification, migrations, seeding
- **Include patterns**: `test/e2e/**/*.e2e.spec.ts`, `test/pbt/**/*.pbt.spec.ts`, `test/negative.e2e.spec.ts`, `test/concurrency.e2e.spec.ts`, `test/security.e2e.spec.ts`

**Playwright Configuration** (`apps/web/test/playwright.config.ts`):
- **Browser projects**: Desktop Chrome, Mobile Android (Pixel 5)
- **Base URL**: `http://localhost:3000`
- **Retries**: 2 in CI, 0 locally
- **Artifacts**: Screenshots on failure, video retained on failure, trace on first retry
- **Web server**: Auto-starts Next.js dev server if not running

**Property-Based Testing** (fast-check):
- **Library**: `fast-check` (already used in the codebase)
- **Integration**: Vitest + fast-check via `fc.assert(fc.property(...))`
- **Async properties**: `fc.assert(fc.asyncProperty(...))` for tests hitting the live API
- **Default iterations**: 100 runs per property
- **Finance-critical iterations**: 1000 runs for allocation, outstanding, schedule, reversal properties
- **Custom arbitraries**: Domain-specific generators in `test/helpers/arbitraries.ts`
- **Each correctness property is implemented by a SINGLE property-based test**
- **Tag format**: `Feature: comprehensive-e2e-testing, Property {number}: {property_text}`

### Dual Testing Approach

**Unit/Example Tests** cover:
- Specific happy-path flows (customer creation, loan lifecycle, disbursement, collection, reversal, foreclosure, closure)
- Auth flows (login, logout, refresh, lockout, password change)
- User management (CRUD, role assignment, area assignment)
- Family member and guarantor CRUD
- Notification outbox (enqueueing, retry, dead-letter, SMS isolation)
- Report generation (all 20+ types, RBAC scoping, export, rate limiting)
- Settings and holiday calendar management
- Audit log queries and append-only enforcement
- Health check endpoints
- Environment variable validation
- Request ID propagation
- Full business flow scenarios (happy path, partial payment → overdue → penalty, group lending, reversal + re-collection, foreclosure, blacklist → reinstatement, advance payment)
- Edge cases (duplicate Aadhaar, expired foreclosure quote, closed loan reopening, already-reversed collection, stale version conflict)
- Integration points (multi-service atomic transactions)
- Error conditions (invalid inputs, unauthorized access, prerequisite failures)

**Property-Based Tests** cover:
- Universal invariants that must hold for all valid inputs (Properties 1–35)
- Comprehensive input coverage through randomized generation using custom arbitraries
- Each property test references its design document property number
- Tag format: **Feature: comprehensive-e2e-testing, Property {number}: {property_text}**

### Property-Based Testing Library

- **Library**: `fast-check` (already used in the codebase)
- **Integration**: Vitest + fast-check via `fc.assert(fc.property(...))`
- **Async properties**: `fc.assert(fc.asyncProperty(...))` for tests hitting the live API
- **Configuration**: Minimum 100 runs default, 1000 for finance-critical properties
- **Custom Arbitraries**: `arbAadhaarNumber`, `arbPanNumber`, `arbMobileNumber`, `arbPaiseAmount`, `arbPrincipalPaise`, `arbAnnualRateBps`, `arbTenureMonths`, `arbInterestType`, `arbFrequency`, `arbPaymentMode`, `arbLoanParams`, `arbPaymentSequence`, `arbLoanStatusPair`, `arbUserRole`, `arbInvalidAadhaar`, `arbInvalidPan`, `arbWhitespaceOnly`
- **Each correctness property is implemented by a SINGLE property-based test**

### Test Execution Order

1. **Global setup**: Verify infrastructure, run migrations, seed baseline data (users, products, accounts, holidays, settings)
2. **Health check tests**: Verify `/health/live` and `/health/ready` (fast, no dependencies)
3. **Auth E2E tests**: Login, logout, refresh, lockout, password change
4. **User management E2E tests**: User CRUD, role assignment, area assignment
5. **Customer E2E tests**: Customer onboarding, family members, guarantors, blacklisting, reinstatement
6. **Loan product E2E tests**: Product creation, versioning, validation
7. **Loan lifecycle E2E tests**: State machine, maker-checker
8. **EMI schedule E2E tests**: Schedule generation, determinism, holidays
9. **Disbursement E2E tests**: Prerequisites, atomicity, idempotency, processing fee
10. **Collection E2E tests**: Posting, allocation, receipts, advance payments
11. **Reversal E2E tests**: Compensating entries, ledger neutrality
12. **Overdue/penalty E2E tests**: DPD, penalty posting, waiver
13. **Foreclosure E2E tests**: Quote, settlement, expiry
14. **Loan closure E2E tests**: Prerequisites, status transition
15. **Group loan E2E tests**: Group creation, group collection, receipts
16. **Accounting/ledger E2E tests**: Journal entries, trial balance, daybook
17. **Cashbook/expense E2E tests**: Expense recording, cash handover, reconciliation
18. **Notification outbox E2E tests**: Enqueueing, retry, dead-letter, SMS isolation
19. **Report E2E tests**: All report types, RBAC scoping, export, rate limiting
20. **Settings/holiday E2E tests**: Settings CRUD, holiday calendar
21. **Audit log E2E tests**: Queries, append-only enforcement
22. **Env validation tests**: Zod startup validator
23. **Request ID tests**: Header propagation
24. **Business flow E2E tests**: Full end-to-end scenarios
25. **PBT tests**: Property-based invariant verification (Properties 1–35)
26. **Negative tests**: Invalid input and error condition verification
27. **Concurrency tests**: Idempotency, locking, collision
28. **Security tests**: RBAC matrix, IDOR, injection, JWT, rate limiting
29. **Playwright tests**: Browser-based UI flows (requires running frontend)
30. **Global teardown**: Clean test data

### Test Isolation Strategy

- **Between suites**: Each E2E test suite creates its own test data via factories and cleans up after completion
- **Between tests within a suite**: Tests within a suite may share setup data (e.g., a created customer) but each test creates its own loan/collection data
- **PBT tests**: Each property test iteration is independent — factories create fresh data per iteration for API-hitting tests
- **Database state**: No shared mutable state between test files. Each file is self-contained.
- **Playwright tests**: Each test starts from a clean browser context with fresh login

### Coverage Expectations

| Test Category | Target Coverage |
|---|---|
| Finance calculation (schedule, allocation, outstanding) | 95% via PBT |
| Loan lifecycle state machine | 90% via E2E |
| Collection/reversal/disbursement flows | 90% via E2E + PBT |
| Auth/session management | 90% via E2E |
| RBAC/security | 90% via security tests |
| Notification outbox | 85% via E2E |
| Report module | 80% via E2E |
| Error handling | 85% via negative tests |
| Concurrency/idempotency | 85% via concurrency tests |
| UI flows (Playwright) | Critical paths only |
| Audit log | 90% via E2E |
| Cashbook/expense | 85% via E2E + PBT |
| Settings/holiday | 80% via E2E |
| Health/env/request-id | 100% via E2E |
