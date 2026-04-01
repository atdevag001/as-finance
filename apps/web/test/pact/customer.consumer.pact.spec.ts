/**
 * Pact Consumer Contract — Customer CRUD Interactions
 *
 * Defines expected API interactions for customer management:
 * - POST /customers (create)
 * - GET /customers/:id (read)
 * - PATCH /customers/:id (update)
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
import { describe, it, expect } from 'vitest';
import { createPact, MatchersV3, uuidMatcher, isoDateMatcher } from './setup';

const AUTH_HEADER = 'Bearer valid-jwt-token';

describe('Customer Consumer Pact', () => {
  const pact = createPact();

  describe('POST /customers', () => {
    it('creates a customer and returns customer object', async () => {
      pact.addInteraction({
        states: [{ description: 'an authenticated field officer exists' }],
        uponReceiving: 'a request to create a new customer',
        withRequest: {
          method: 'POST',
          path: '/customers',
          headers: {
            'Content-Type': 'application/json',
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
          body: {
            fullName: 'Ravi Kumar',
            fatherOrHusbandName: 'Suresh Kumar',
            mobile: '9876543210',
            aadhaarNumber: '234567890123',
            gender: 'male',
            addressLine1: '123 Main Street',
            city: 'Jaipur',
            district: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302001',
          },
        },
        willRespondWith: {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            customer: {
              id: uuidMatcher(),
              full_name: MatchersV3.like('Ravi Kumar'),
              mobile: MatchersV3.like('9876543210'),
              status: MatchersV3.like('active'),
              aadhaar_last_four: MatchersV3.like('0123'),
              city: MatchersV3.like('Jaipur'),
              district: MatchersV3.like('Jaipur'),
              state: MatchersV3.like('Rajasthan'),
              pincode: MatchersV3.like('302001'),
              created_at: isoDateMatcher('2024-01-15T10:30:00Z'),
            },
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/customers`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: AUTH_HEADER,
          },
          body: JSON.stringify({
            fullName: 'Ravi Kumar',
            fatherOrHusbandName: 'Suresh Kumar',
            mobile: '9876543210',
            aadhaarNumber: '234567890123',
            gender: 'male',
            addressLine1: '123 Main Street',
            city: 'Jaipur',
            district: 'Jaipur',
            state: 'Rajasthan',
            pincode: '302001',
          }),
        });

        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.customer).toHaveProperty('id');
        expect(body.customer).toHaveProperty('full_name');
        expect(body.customer).toHaveProperty('status');
      });
    });
  });

  describe('GET /customers/:id', () => {
    it('returns customer details for existing customer', async () => {
      const customerId = '00000000-0000-4000-a000-000000000001';

      pact.addInteraction({
        states: [{ description: 'a customer with known ID exists' }],
        uponReceiving: 'a request to get customer by ID',
        withRequest: {
          method: 'GET',
          path: `/customers/${customerId}`,
          headers: {
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: uuidMatcher(customerId),
            full_name: MatchersV3.like('Ravi Kumar'),
            mobile: MatchersV3.like('9876543210'),
            status: MatchersV3.like('active'),
            aadhaar_last_four: MatchersV3.like('0123'),
            gender: MatchersV3.like('male'),
            city: MatchersV3.like('Jaipur'),
            created_at: isoDateMatcher('2024-01-15T10:30:00Z'),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/customers/${customerId}`, {
          headers: { Authorization: AUTH_HEADER },
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('id');
        expect(body).toHaveProperty('full_name');
        expect(body).toHaveProperty('status');
      });
    });
  });

  describe('PATCH /customers/:id', () => {
    it('updates customer and returns updated object', async () => {
      const customerId = '00000000-0000-4000-a000-000000000001';

      pact.addInteraction({
        states: [{ description: 'a customer with known ID exists' }],
        uponReceiving: 'a request to update customer notes',
        withRequest: {
          method: 'PATCH',
          path: `/customers/${customerId}`,
          headers: {
            'Content-Type': 'application/json',
            Authorization: MatchersV3.like(AUTH_HEADER),
          },
          body: {
            notes: 'Updated via pact test',
          },
        },
        willRespondWith: {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: uuidMatcher(customerId),
            full_name: MatchersV3.like('Ravi Kumar'),
            status: MatchersV3.like('active'),
          },
        },
      });

      await pact.executeTest(async (mockServer) => {
        const res = await fetch(`${mockServer.url}/customers/${customerId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: AUTH_HEADER,
          },
          body: JSON.stringify({ notes: 'Updated via pact test' }),
        });

        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toHaveProperty('id');
        expect(typeof body.id).toBe('string');
      });
    });
  });
});
