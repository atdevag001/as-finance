/**
 * Test Factories for E2E Tests
 *
 * Factory functions that create valid entities via the API, returning the created
 * entity with its ID. Each factory accepts optional overrides for customization
 * and uses unique suffixes to avoid duplicate conflicts between test runs.
 */

import supertest from 'supertest';
import { randomUUID } from 'crypto';
import type { AuthClients } from './auth-client.js';
import { loadTestConfig } from '../setup/test-config.js';

// ─── Unique Suffix Generator ─────────────────────────────────────────────────

let counter = 0;

/** Generate a unique suffix combining timestamp + counter to avoid collisions. */
function uniqueSuffix(): string {
  return `${Date.now()}_${++counter}`;
}

/** Generate a unique 10-digit Indian mobile number (starts with 6-9). */
function uniqueMobile(): string {
  const suffix = uniqueSuffix();
  const digits = suffix.replace(/\D/g, '').slice(-9).padStart(9, '0');
  return `9${digits}`;
}

/** Generate a unique 12-digit Aadhaar number (does not start with 0 or 1). */
function uniqueAadhaar(): string {
  const suffix = uniqueSuffix();
  const digits = suffix.replace(/\D/g, '').slice(-11).padStart(11, '0');
  return `2${digits}`;
}

/** Generate a unique username. */
function uniqueUsername(prefix = 'test_user'): string {
  return `${prefix}_${uniqueSuffix()}`;
}

// ─── Factory Defaults ────────────────────────────────────────────────────────

export const CUSTOMER_DEFAULTS = {
  fullName: 'Test Customer',
  fatherOrHusbandName: 'Test Father',
  mobile: '9876543210',
  aadhaarNumber: '234567890123',
  gender: 'male',
  addressLine1: '123 Test Street',
  city: 'TestCity',
  district: 'TestDistrict',
  state: 'TestState',
  pincode: '123456',
};

export const FAMILY_MEMBER_DEFAULTS = {
  name: 'Test Family Member',
  relationship: 'spouse',
  contactNumber: '9876543211',
};

export const GUARANTOR_DEFAULTS = {
  name: 'Test Guarantor',
  relationship: 'friend',
  mobile: '9876543212',
  aadhaarNumber: '345678901234',
  address: '456 Guarantor Street, TestCity',
};

export const LOAN_DEFAULTS = {
  principalPaise: 10_000_00,
  tenureMonths: 12,
  purpose: 'E2E test loan',
};

export const COLLECTION_DEFAULTS = {
  paymentMode: 'cash',
  paymentDate: '2024-01-15',
};

export const USER_DEFAULTS = {
  fullName: 'Test User',
  mobile: '9876543299',
  role: 'field_officer' as const,
  password: 'TestPass123',
};

// ─── Response Types ──────────────────────────────────────────────────────────

/** Generic API response body — factories return the parsed JSON. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ApiResponse = Record<string, any>;

// ─── Loan Status Chain ───────────────────────────────────────────────────────

/**
 * Ordered loan status chain for advancing a loan through its lifecycle.
 * Each entry maps a target status to the API action needed to reach it.
 */
const LOAN_STATUS_CHAIN: Array<{
  status: string;
  action: (loanId: string, clients: AuthClients) => Promise<supertest.Response>;
}> = [
  {
    status: 'submitted',
    action: (loanId, clients) =>
      clients.fieldOfficer.post(`/loans/${loanId}/submit`).send(),
  },
  {
    status: 'under_review',
    action: (loanId, clients) =>
      clients.manager.post(`/loans/${loanId}/review`).send(),
  },
  {
    status: 'approved',
    action: (loanId, clients) =>
      clients.manager.post(`/loans/${loanId}/approve`).send({ remarks: 'E2E test approval' }),
  },
  {
    status: 'disbursed',
    action: (loanId, clients) =>
      clients.manager
        .post('/disbursements')
        .send({
          loanId,
          mode: 'cash',
          idempotencyKey: `e2e-disburse-${loanId}-${uniqueSuffix()}`,
        }),
  },
  {
    // Disbursement transitions approved → disbursed → active atomically,
    // so 'active' is reached via the disbursement step above.
    status: 'active',
    action: async () => ({ body: {} } as supertest.Response),
  },
];

// ─── Factory Functions ───────────────────────────────────────────────────────

/**
 * Login as a specific user and return the access token + user ID.
 */
export async function loginAs(
  username: string,
  password: string,
): Promise<{ token: string; userId: string }> {
  const config = loadTestConfig();
  const res = await supertest(config.api.baseUrl)
    .post('/auth/login')
    .send({ username, password })
    .expect(200);

  return {
    token: res.body.accessToken,
    userId: res.body.user?.id ?? res.body.userId,
  };
}

/**
 * Create a new user via the API.
 */
export async function createUser(
  client: supertest.Agent,
  overrides: Partial<{
    username: string;
    password: string;
    fullName: string;
    email: string;
    mobile: string;
    role: string;
  }> = {},
): Promise<ApiResponse> {
  const payload = {
    username: overrides.username ?? uniqueUsername(),
    password: overrides.password ?? USER_DEFAULTS.password,
    fullName: overrides.fullName ?? USER_DEFAULTS.fullName,
    mobile: overrides.mobile ?? uniqueMobile(),
    role: overrides.role ?? USER_DEFAULTS.role,
    ...(overrides.email && { email: overrides.email }),
  };

  const res = await client.post('/users').send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `createUser failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return { ...res.body, _password: payload.password, _username: payload.username };
}

/**
 * Assign an area to a user.
 */
export async function assignArea(
  client: supertest.Agent,
  userId: string,
  areaName: string,
): Promise<void> {
  const res = await client
    .post(`/users/${userId}/area-assignments`)
    .send({ areaName });

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `assignArea failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }
}

/**
 * Create a new customer via the API.
 */
export async function createCustomer(
  client: supertest.Agent,
  overrides: Partial<{
    fullName: string;
    fatherOrHusbandName: string;
    mobile: string;
    aadhaarNumber: string;
    gender: string;
    addressLine1: string;
    city: string;
    district: string;
    state: string;
    pincode: string;
    panNumber: string;
    dob: string;
    age: number;
    occupation: string;
    monthlyIncomePaise: number;
    assignedOfficerId: string;
    notes: string;
  }> = {},
): Promise<ApiResponse> {
  const payload = {
    fullName: overrides.fullName ?? CUSTOMER_DEFAULTS.fullName,
    fatherOrHusbandName: overrides.fatherOrHusbandName ?? CUSTOMER_DEFAULTS.fatherOrHusbandName,
    mobile: overrides.mobile ?? uniqueMobile(),
    aadhaarNumber: overrides.aadhaarNumber ?? uniqueAadhaar(),
    gender: overrides.gender ?? CUSTOMER_DEFAULTS.gender,
    addressLine1: overrides.addressLine1 ?? CUSTOMER_DEFAULTS.addressLine1,
    city: overrides.city ?? CUSTOMER_DEFAULTS.city,
    district: overrides.district ?? CUSTOMER_DEFAULTS.district,
    state: overrides.state ?? CUSTOMER_DEFAULTS.state,
    pincode: overrides.pincode ?? CUSTOMER_DEFAULTS.pincode,
    ...(overrides.panNumber && { panNumber: overrides.panNumber }),
    ...(overrides.dob && { dob: overrides.dob }),
    ...(overrides.age !== undefined && { age: overrides.age }),
    ...(overrides.occupation && { occupation: overrides.occupation }),
    ...(overrides.monthlyIncomePaise !== undefined && { monthlyIncomePaise: overrides.monthlyIncomePaise }),
    ...(overrides.assignedOfficerId && { assignedOfficerId: overrides.assignedOfficerId }),
    ...(overrides.notes && { notes: overrides.notes }),
  };

  const res = await client.post('/customers').send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `createCustomer failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body;
}

/**
 * Add a family member to a customer.
 */
export async function addFamilyMember(
  client: supertest.Agent,
  customerId: string,
  overrides: Partial<{
    name: string;
    relationship: string;
    contactNumber: string;
    occupation: string;
    incomeContribution: string;
  }> = {},
): Promise<ApiResponse> {
  const payload = {
    name: overrides.name ?? FAMILY_MEMBER_DEFAULTS.name,
    relationship: overrides.relationship ?? FAMILY_MEMBER_DEFAULTS.relationship,
    ...(overrides.contactNumber !== undefined
      ? { contactNumber: overrides.contactNumber }
      : { contactNumber: uniqueMobile() }),
    ...(overrides.occupation && { occupation: overrides.occupation }),
    ...(overrides.incomeContribution && { incomeContribution: overrides.incomeContribution }),
  };

  const res = await client
    .post(`/customers/${customerId}/family-members`)
    .send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `addFamilyMember failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body;
}

/**
 * Add a guarantor to a customer.
 */
export async function addGuarantor(
  client: supertest.Agent,
  customerId: string,
  overrides: Partial<{
    name: string;
    relationship: string;
    mobile: string;
    aadhaarNumber: string;
    address: string;
  }> = {},
): Promise<ApiResponse> {
  const payload = {
    name: overrides.name ?? GUARANTOR_DEFAULTS.name,
    relationship: overrides.relationship ?? GUARANTOR_DEFAULTS.relationship,
    mobile: overrides.mobile ?? uniqueMobile(),
    aadhaarNumber: overrides.aadhaarNumber ?? uniqueAadhaar(),
    address: overrides.address ?? GUARANTOR_DEFAULTS.address,
  };

  const res = await client
    .post(`/customers/${customerId}/guarantors`)
    .send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `addGuarantor failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body;
}

/**
 * Create a new loan product via the API.
 */
export async function createLoanProduct(
  client: supertest.Agent,
  overrides: Partial<{
    name: string;
    interestType: 'flat' | 'reducing_balance';
    annualRateBps: number;
    minPrincipalPaise: number;
    maxPrincipalPaise: number;
    minTenureMonths: number;
    maxTenureMonths: number;
    repaymentFrequency: 'daily' | 'weekly' | 'monthly';
    processingFeeType: 'fixed' | 'percentage';
    processingFeeValue: number;
    penaltyGraceDays: number;
    penaltyType: 'flat_per_period' | 'percentage_of_overdue';
    penaltyValue: number;
    penaltyFrequency: 'daily' | 'weekly' | 'monthly';
    allocationOrder: string[];
  }> = {},
): Promise<ApiResponse> {
  const payload = {
    name: overrides.name ?? `Test Product ${uniqueSuffix()}`,
    interestType: overrides.interestType ?? 'flat',
    annualRateBps: overrides.annualRateBps ?? 1200,
    minPrincipalPaise: overrides.minPrincipalPaise ?? 1_000_00,
    maxPrincipalPaise: overrides.maxPrincipalPaise ?? 5_00_000_00,
    minTenureMonths: overrides.minTenureMonths ?? 3,
    maxTenureMonths: overrides.maxTenureMonths ?? 36,
    repaymentFrequency: overrides.repaymentFrequency ?? 'monthly',
    ...(overrides.processingFeeType && { processingFeeType: overrides.processingFeeType }),
    ...(overrides.processingFeeValue !== undefined && { processingFeeValue: overrides.processingFeeValue }),
    ...(overrides.penaltyGraceDays !== undefined && { penaltyGraceDays: overrides.penaltyGraceDays }),
    ...(overrides.penaltyType && { penaltyType: overrides.penaltyType }),
    ...(overrides.penaltyValue !== undefined && { penaltyValue: overrides.penaltyValue }),
    ...(overrides.penaltyFrequency && { penaltyFrequency: overrides.penaltyFrequency }),
    ...(overrides.allocationOrder && { allocationOrder: overrides.allocationOrder }),
  };

  const res = await client.post('/loan-products').send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `createLoanProduct failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body;
}

/**
 * Create a loan via the API, optionally advancing it through the status chain.
 *
 * @param client - Supertest agent for the initial loan creation (typically fieldOfficer)
 * @param opts.customerId - Customer UUID
 * @param opts.productVersionId - Loan product version UUID
 * @param opts.overrides - Optional overrides for the loan DTO
 * @param opts.advanceTo - Optional target status to advance the loan to
 * @param opts.clients - Required if advanceTo is specified (needs multiple role agents)
 */
export async function createLoan(
  client: supertest.Agent,
  opts: {
    customerId: string;
    productVersionId: string;
    overrides?: Partial<{
      principalPaise: number;
      tenureMonths: number;
      purpose: string;
      groupId: string;
    }>;
    advanceTo?: string;
    clients?: AuthClients;
  },
): Promise<ApiResponse> {
  const payload = {
    customerId: opts.customerId,
    productVersionId: opts.productVersionId,
    principalPaise: opts.overrides?.principalPaise ?? LOAN_DEFAULTS.principalPaise,
    tenureMonths: opts.overrides?.tenureMonths ?? LOAN_DEFAULTS.tenureMonths,
    purpose: opts.overrides?.purpose ?? LOAN_DEFAULTS.purpose,
    ...(opts.overrides?.groupId && { groupId: opts.overrides.groupId }),
  };

  const res = await client.post('/loans').send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `createLoan failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  let loan = res.body;

  // Advance through the status chain if requested
  if (opts.advanceTo && opts.clients) {
    loan = await advanceLoanToStatus(loan.id, opts.advanceTo, opts.clients);
  }

  return loan;
}

/**
 * Advance a loan through the status chain to the target status.
 * Returns the loan response after reaching the target status.
 */
async function advanceLoanToStatus(
  loanId: string,
  targetStatus: string,
  clients: AuthClients,
): Promise<ApiResponse> {
  // The loan starts in 'draft' status after creation.
  // Walk through the chain until we reach the target.
  for (const step of LOAN_STATUS_CHAIN) {
    // Disbursement transitions approved → disbursed → active atomically.
    // If target is 'disbursed', we still call the disbursement action.
    // If target is 'active', the disbursement action handles it.
    if (step.status === 'active' && targetStatus === 'disbursed') {
      // Already reached via the disbursement step — stop here.
      break;
    }

    if (step.status === 'active' && targetStatus !== 'active') {
      // Skip the no-op active step if we're not targeting active
      continue;
    }

    const actionRes = await step.action(loanId, clients);

    if (
      actionRes.status &&
      actionRes.status !== 200 &&
      actionRes.status !== 201
    ) {
      throw new Error(
        `advanceLoanToStatus failed at '${step.status}': status=${actionRes.status}, body=${JSON.stringify(actionRes.body)}`,
      );
    }

    if (step.status === targetStatus) break;

    // Disbursement goes approved → active atomically, so if we just did
    // the disbursement step and target is 'active', we're done.
    if (step.status === 'disbursed' && targetStatus === 'active') break;
  }

  // Fetch the final loan state
  const finalRes = await clients.fieldOfficer.get(`/loans/${loanId}`);
  return finalRes.body;
}

/**
 * Post a collection (payment) against a loan.
 */
export async function postCollection(
  client: supertest.Agent,
  opts: {
    loanId: string;
    amountPaise: number;
    overrides?: Partial<{
      paymentMode: string;
      paymentDate: string;
      idempotencyKey: string;
    }>;
  },
): Promise<ApiResponse> {
  const payload = {
    loanId: opts.loanId,
    amountPaise: opts.amountPaise,
    paymentMode: opts.overrides?.paymentMode ?? COLLECTION_DEFAULTS.paymentMode,
    paymentDate: opts.overrides?.paymentDate ?? COLLECTION_DEFAULTS.paymentDate,
    idempotencyKey: opts.overrides?.idempotencyKey ?? `e2e-coll-${randomUUID()}`,
  };

  const res = await client.post('/collections').send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `postCollection failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body;
}

/**
 * Create a group via the API.
 */
export async function createGroup(
  client: supertest.Agent,
  opts: {
    leaderId: string;
    overrides?: Partial<{
      name: string;
      meetingDay: string;
      branchArea: string;
    }>;
  },
): Promise<ApiResponse> {
  const payload = {
    name: opts.overrides?.name ?? `Test Group ${uniqueSuffix()}`,
    meetingDay: opts.overrides?.meetingDay ?? 'monday',
    branchArea: opts.overrides?.branchArea ?? 'TestArea',
    leaderId: opts.leaderId,
  };

  const res = await client.post('/groups').send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `createGroup failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body;
}

/**
 * Record an expense via the API.
 */
export async function recordExpense(
  client: supertest.Agent,
  overrides: Partial<{
    category: string;
    amountPaise: number;
    date: string;
    description: string;
  }> = {},
): Promise<ApiResponse> {
  const payload = {
    category: overrides.category ?? 'travel',
    amountPaise: overrides.amountPaise ?? 500_00,
    date: overrides.date ?? new Date().toISOString().split('T')[0],
    description: overrides.description ?? `E2E test expense ${uniqueSuffix()}`,
  };

  const res = await client.post('/cashbook/expenses').send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `recordExpense failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body;
}

/**
 * Create a cash handover via the API.
 */
export async function createHandover(
  client: supertest.Agent,
  overrides: Partial<{
    totalAmountPaise: number;
    receivingOfficerId: string;
    handoverDate: string;
  }> = {},
): Promise<ApiResponse> {
  if (!overrides.receivingOfficerId) {
    throw new Error('createHandover requires receivingOfficerId in overrides');
  }

  const payload = {
    totalAmountPaise: overrides.totalAmountPaise ?? 10_000_00,
    receivingOfficerId: overrides.receivingOfficerId,
    handoverDate: overrides.handoverDate ?? new Date().toISOString().split('T')[0],
  };

  const res = await client.post('/cashbook/handovers').send(payload);

  if (res.status !== 201 && res.status !== 200) {
    throw new Error(
      `createHandover failed: status=${res.status}, body=${JSON.stringify(res.body)}`,
    );
  }

  return res.body;
}

// ─── Utility Helpers ─────────────────────────────────────────────────────────

/**
 * Create a customer, create a loan, and advance it through all statuses to 'active'.
 * Returns the active loan response.
 */
export async function advanceLoanToActive(
  clients: AuthClients,
  customerId: string,
  productVersionId: string,
): Promise<ApiResponse> {
  return createLoan(clients.fieldOfficer, {
    customerId,
    productVersionId,
    advanceTo: 'active',
    clients,
  });
}

/**
 * Create a fully active loan with N collections posted against it.
 * Creates a customer, creates a loan, advances to active, then posts payments.
 */
export async function createLoanWithPayments(
  clients: AuthClients,
  opts: {
    paymentCount: number;
    paymentAmountPaise: number;
    productVersionId?: string;
    paymentDate?: string;
  },
): Promise<{ loan: ApiResponse; collections: ApiResponse[] }> {
  // Use seed data product version if not provided
  const seedData = (globalThis as Record<string, unknown>)['__SEED_DATA__'] as
    | { products: { flatMonthly: { versionId: string } } }
    | undefined;

  const productVersionId =
    opts.productVersionId ?? seedData?.products?.flatMonthly?.versionId;

  if (!productVersionId) {
    throw new Error(
      'createLoanWithPayments: no productVersionId provided and seed data not available',
    );
  }

  // Create a customer
  const customer = await createCustomer(clients.fieldOfficer);

  // Create and advance loan to active
  const loan = await advanceLoanToActive(clients, customer['id'], productVersionId);

  // Post N collections
  const collections: ApiResponse[] = [];
  for (let i = 0; i < opts.paymentCount; i++) {
    const collection = await postCollection(clients.collectionOfficer, {
      loanId: loan['id'],
      amountPaise: opts.paymentAmountPaise,
      overrides: {
        paymentDate: opts.paymentDate ?? COLLECTION_DEFAULTS.paymentDate,
      },
    });
    collections.push(collection);
  }

  return { loan, collections };
}
