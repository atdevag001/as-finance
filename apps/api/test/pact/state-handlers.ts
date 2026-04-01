/**
 * Pact Provider State Handlers
 *
 * Sets up test data for each provider state defined in consumer Pact contracts.
 * Uses the existing E2E seed data and test factories to create required entities.
 *
 * Each handler is keyed by the exact state description string from the consumer tests.
 */

import type { SeedData } from '../setup/global-setup';
import {
  createCustomer,
  createLoan,
  postCollection,
} from '../helpers/factories';
import { createAuthClients, type AuthClients } from '../helpers/auth-client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type StateHandler = () => Promise<void>;
export type StateHandlerMap = Record<string, StateHandler>;

// ─── Shared State ────────────────────────────────────────────────────────────

/** Mutable context shared across state handlers within a single verification run. */
const stateContext: Record<string, unknown> = {};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSeedData(): SeedData {
  const seed = (globalThis as Record<string, unknown>)['__SEED_DATA__'] as SeedData | undefined;
  if (!seed) throw new Error('Seed data not available — ensure global setup has run');
  return seed;
}

function getApiBaseUrl(): string {
  const url = (globalThis as Record<string, unknown>)['__API_BASE_URL__'] as string | undefined;
  return url ?? 'http://localhost:3001';
}

function getAuthClients(): AuthClients {
  if (stateContext['_authClients']) return stateContext['_authClients'] as AuthClients;

  const seed = getSeedData();
  const baseUrl = getApiBaseUrl();
  const tokens: Record<string, string> = {};
  for (const [key, user] of Object.entries(seed.users)) {
    tokens[key] = user.token;
  }
  const clients = createAuthClients(baseUrl, tokens);
  stateContext['_authClients'] = clients;
  return clients;
}

// ─── State Handlers ──────────────────────────────────────────────────────────

export function createStateHandlers(): StateHandlerMap {
  return {
    // ── Auth States ────────────────────────────────────────────────────────

    'a user with username "manager1" exists': async () => {
      // The E2E seed already creates users. The consumer test uses "manager1"
      // but our seed uses "e2e_manager". The Pact verifier will use the real
      // API which has the seeded users. No additional setup needed — the
      // login endpoint will be hit with real credentials via request filters.
    },

    'a valid refresh token exists': async () => {
      // Refresh tokens are created on login. The request filter will supply
      // a valid token obtained from the seed user login flow.
    },

    // ── Customer States ────────────────────────────────────────────────────

    'an authenticated field officer exists': async () => {
      // Field officer already exists from seed data. No additional setup.
    },

    'a customer with known ID exists': async () => {
      // Create a customer so the GET/PATCH endpoints have data to return.
      // The consumer test uses a fixed UUID, but the provider verification
      // will use the real API — we just need at least one customer to exist.
      const clients = getAuthClients();
      if (!stateContext['_customerCreated']) {
        try {
          const customer = await createCustomer(clients.fieldOfficer, {
            fullName: 'Pact Test Customer',
          });
          stateContext['_customerCreated'] = true;
          stateContext['_customerId'] = customer.id ?? customer['customer']?.id;
        } catch {
          // Customer may already exist from a previous run — that's fine
          stateContext['_customerCreated'] = true;
        }
      }
    },

    // ── Collection States ──────────────────────────────────────────────────

    'an active loan exists for collection': async () => {
      // Create a customer + active loan so collection posting can succeed.
      const clients = getAuthClients();
      const seed = getSeedData();

      if (!stateContext['_activeLoanForCollection']) {
        const customer = await createCustomer(clients.fieldOfficer, {
          fullName: 'Pact Collection Customer',
        });
        const customerId = customer.id ?? customer['customer']?.id;

        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId: seed.products.flatMonthly.versionId,
          advanceTo: 'active',
          clients,
        });

        stateContext['_activeLoanForCollection'] = loan;
        stateContext['_activeLoanId'] = loan.id;
      }
    },

    'an authenticated user exists': async () => {
      // Users already exist from seed data. No additional setup needed.
    },

    'no authentication token provided': async () => {
      // No setup needed — the consumer test sends no auth header.
    },

    // ── Schedule / Loan Detail States ──────────────────────────────────────

    'an active loan with schedules exists': async () => {
      // Create a customer + active loan (which generates schedules on disbursement).
      const clients = getAuthClients();
      const seed = getSeedData();

      if (!stateContext['_activeLoanWithSchedules']) {
        const customer = await createCustomer(clients.fieldOfficer, {
          fullName: 'Pact Schedule Customer',
        });
        const customerId = customer.id ?? customer['customer']?.id;

        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId: seed.products.flatMonthly.versionId,
          advanceTo: 'active',
          clients,
        });

        stateContext['_activeLoanWithSchedules'] = loan;
      }
    },

    'no loan exists with the given ID': async () => {
      // No setup needed — the consumer test uses a non-existent UUID.
    },

    // ── Loan Lifecycle States ──────────────────────────────────────────────

    'a customer and product version exist': async () => {
      // Seed data already has loan products. Create a customer for loan creation.
      const clients = getAuthClients();

      if (!stateContext['_customerForLoan']) {
        const customer = await createCustomer(clients.fieldOfficer, {
          fullName: 'Pact Loan Customer',
        });
        stateContext['_customerForLoan'] = customer;
      }
    },

    'a loan in under_review status exists': async () => {
      // Create a loan and advance it to under_review status.
      const clients = getAuthClients();
      const seed = getSeedData();

      if (!stateContext['_underReviewLoan']) {
        const customer = await createCustomer(clients.fieldOfficer, {
          fullName: 'Pact Review Customer',
        });
        const customerId = customer.id ?? customer['customer']?.id;

        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId: seed.products.flatMonthly.versionId,
          advanceTo: 'under_review',
          clients,
        });

        stateContext['_underReviewLoan'] = loan;
      }
    },

    'an approved loan exists ready for disbursement': async () => {
      // Create a loan and advance it to approved status.
      const clients = getAuthClients();
      const seed = getSeedData();

      if (!stateContext['_approvedLoan']) {
        const customer = await createCustomer(clients.fieldOfficer, {
          fullName: 'Pact Disburse Customer',
        });
        const customerId = customer.id ?? customer['customer']?.id;

        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId: seed.products.flatMonthly.versionId,
          advanceTo: 'approved',
          clients,
        });

        stateContext['_approvedLoan'] = loan;
      }
    },

    // ── Reversal States ────────────────────────────────────────────────────

    'a posted collection exists for reversal': async () => {
      // Create a customer + active loan + post a collection.
      const clients = getAuthClients();
      const seed = getSeedData();

      if (!stateContext['_postedCollection']) {
        const customer = await createCustomer(clients.fieldOfficer, {
          fullName: 'Pact Reversal Customer',
        });
        const customerId = customer.id ?? customer['customer']?.id;

        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId: seed.products.flatMonthly.versionId,
          advanceTo: 'active',
          clients,
        });

        const collection = await postCollection(clients.collectionOfficer, {
          loanId: loan.id,
          amountPaise: 100_00,
        });

        stateContext['_postedCollection'] = collection;
        stateContext['_postedCollectionLoan'] = loan;
      }
    },

    // ── Report States ──────────────────────────────────────────────────────

    'report data exists for daily-collection': async () => {
      // Ensure at least one collection exists so the report has data.
      // If we already created a collection for reversal, that's sufficient.
      // Otherwise create one.
      const clients = getAuthClients();
      const seed = getSeedData();

      if (!stateContext['_reportDataReady'] && !stateContext['_postedCollection']) {
        const customer = await createCustomer(clients.fieldOfficer, {
          fullName: 'Pact Report Customer',
        });
        const customerId = customer.id ?? customer['customer']?.id;

        const loan = await createLoan(clients.fieldOfficer, {
          customerId,
          productVersionId: seed.products.flatMonthly.versionId,
          advanceTo: 'active',
          clients,
        });

        await postCollection(clients.collectionOfficer, {
          loanId: loan.id,
          amountPaise: 100_00,
        });
      }

      stateContext['_reportDataReady'] = true;
    },
  };
}

/**
 * Reset shared state context between verification runs.
 */
export function resetStateContext(): void {
  for (const key of Object.keys(stateContext)) {
    delete stateContext[key];
  }
}
