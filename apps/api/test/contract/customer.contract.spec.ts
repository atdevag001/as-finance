import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createCustomer } from '../helpers/factories.js';

/**
 * Customer API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for all customer endpoints: GET /customers, POST /customers, GET /customers/:id,
 * PATCH /customers/:id, POST /customers/:id/blacklist, POST /customers/:id/reinstate,
 * POST /customers/:id/family-members, POST /customers/:id/guarantors.
 *
 * Validates: Requirements 40.3, 40.18, 40.19
 */

describe('Customer Contract Tests', () => {
  let apiBaseUrl: string;
  let clients: AuthClients;
  let testCustomerId: string;

  beforeAll(async () => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    // Create a customer for read/update/blacklist tests
    const customerRes = await createCustomer(clients.fieldOfficer);
    testCustomerId = customerRes['customer']?.['id'] ?? customerRes['id'];
  });

  // ─── POST /customers — Response Shape ──────────────────────────────────

  describe('POST /customers', () => {
    describe('response shape', () => {
      it('should return customer object with expected fields on success', async () => {
        const res = await clients.fieldOfficer.post('/customers').send({
          fullName: 'Contract Test Customer',
          fatherOrHusbandName: 'Contract Father',
          mobile: `9${Date.now().toString().slice(-9)}`,
          aadhaarNumber: `2${Date.now().toString().slice(-11).padStart(11, '0')}`,
          gender: 'male',
          addressLine1: '123 Contract Street',
          city: 'ContractCity',
          district: 'ContractDistrict',
          state: 'ContractState',
          pincode: '110001',
        });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('customer');
        const c = res.body.customer;
        expect(typeof c.id).toBe('string');
        expect(typeof c.full_name).toBe('string');
        expect(typeof c.mobile).toBe('string');
        expect(typeof c.status).toBe('string');
        expect(c).toHaveProperty('aadhaar_last_four');
        expect(c).toHaveProperty('city');
        expect(c).toHaveProperty('district');
        expect(c).toHaveProperty('state');
        expect(c).toHaveProperty('pincode');
        expect(c).toHaveProperty('created_at');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.fieldOfficer.post('/customers').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when fullName is missing', async () => {
        const res = await clients.fieldOfficer.post('/customers').send({
          mobile: '9876543210',
          aadhaarNumber: '234567890123',
          gender: 'male',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: '123456',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 for invalid Aadhaar format (not 12 digits)', async () => {
        const res = await clients.fieldOfficer.post('/customers').send({
          fullName: 'Bad Aadhaar',
          mobile: '9876543210',
          aadhaarNumber: '12345',
          gender: 'male',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: '123456',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 for invalid mobile format', async () => {
        const res = await clients.fieldOfficer.post('/customers').send({
          fullName: 'Bad Mobile',
          mobile: '12345',
          aadhaarNumber: '234567890123',
          gender: 'male',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: '123456',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 for invalid PAN format', async () => {
        const res = await clients.fieldOfficer.post('/customers').send({
          fullName: 'Bad PAN',
          mobile: '9876543210',
          aadhaarNumber: '234567890123',
          panNumber: 'INVALID',
          gender: 'male',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: '123456',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 for invalid gender enum', async () => {
        const res = await clients.fieldOfficer.post('/customers').send({
          fullName: 'Bad Gender',
          mobile: '9876543210',
          aadhaarNumber: '234567890123',
          gender: 'invalid_gender',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: '123456',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 for invalid pincode format', async () => {
        const res = await clients.fieldOfficer.post('/customers').send({
          fullName: 'Bad Pincode',
          mobile: '9876543210',
          aadhaarNumber: '234567890123',
          gender: 'male',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: 'ABC',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/customers').send({
          fullName: 'Unauth Customer',
          mobile: '9876543210',
          aadhaarNumber: '234567890123',
          gender: 'male',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: '123456',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/customers').send({
          fullName: 'Expired Token Customer',
          mobile: '9876543210',
          aadhaarNumber: '234567890123',
          gender: 'male',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: '123456',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/customers').send({
          fullName: 'Tampered Token Customer',
          mobile: '9876543210',
          aadhaarNumber: '234567890123',
          gender: 'male',
          addressLine1: '123 Street',
          city: 'City',
          district: 'District',
          state: 'State',
          pincode: '123456',
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /customers — Response Shape ───────────────────────────────────

  describe('GET /customers', () => {
    describe('response shape', () => {
      it('should return paginated list with data array and total', async () => {
        const res = await clients.fieldOfficer.get('/customers');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body).toHaveProperty('total');
        expect(typeof res.body.total).toBe('number');
      });

      it('should accept pagination query params', async () => {
        const res = await clients.fieldOfficer.get('/customers?skip=0&take=5');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeLessThanOrEqual(5);
      });

      it('should accept status filter', async () => {
        const res = await clients.fieldOfficer.get('/customers?status=active');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/customers');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /customers/:id — Response Shape ───────────────────────────────

  describe('GET /customers/:id', () => {
    describe('response shape', () => {
      it('should return customer object with expected fields', async () => {
        const res = await clients.fieldOfficer.get(`/customers/${testCustomerId}`);

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(typeof res.body.full_name).toBe('string');
        expect(typeof res.body.mobile).toBe('string');
        expect(typeof res.body.status).toBe('string');
        expect(res.body).toHaveProperty('aadhaar_last_four');
        expect(res.body).toHaveProperty('gender');
        expect(res.body).toHaveProperty('city');
        expect(res.body).toHaveProperty('created_at');
      });

      it('should return 404 for non-existent customer', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.fieldOfficer.get(`/customers/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get(`/customers/${testCustomerId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── PATCH /customers/:id — Response Shape ─────────────────────────────

  describe('PATCH /customers/:id', () => {
    describe('response shape', () => {
      it('should return updated customer on success', async () => {
        const res = await clients.manager
          .patch(`/customers/${testCustomerId}`)
          .send({ notes: 'Contract test update' });

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(res.body.id).toBe(testCustomerId);
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 for invalid mobile format in update', async () => {
        const res = await clients.fieldOfficer
          .patch(`/customers/${testCustomerId}`)
          .send({ mobile: '12345' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 for invalid PAN format in update', async () => {
        const res = await clients.fieldOfficer
          .patch(`/customers/${testCustomerId}`)
          .send({ panNumber: 'INVALID' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 for invalid pincode in update', async () => {
        const res = await clients.fieldOfficer
          .patch(`/customers/${testCustomerId}`)
          .send({ pincode: 'ABC' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .patch(`/customers/${testCustomerId}`)
          .send({ notes: 'Unauth update' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /customers/:id/blacklist — Response Shape ────────────────────

  describe('POST /customers/:id/blacklist', () => {
    let blacklistCustomerId: string;

    beforeAll(async () => {
      const customerRes = await createCustomer(clients.fieldOfficer);
      blacklistCustomerId = customerRes['customer']?.['id'] ?? customerRes['id'];
    });

    describe('response shape', () => {
      it('should return updated customer with blacklisted status', async () => {
        const res = await clients.manager
          .post(`/customers/${blacklistCustomerId}/blacklist`)
          .send({ reason: 'Contract test blacklist' });

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(res.body.status).toBe('blacklisted');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when reason is missing', async () => {
        const customerRes = await createCustomer(clients.fieldOfficer);
        const cId = customerRes['customer']?.['id'] ?? customerRes['id'];
        const res = await clients.manager
          .post(`/customers/${cId}/blacklist`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when reason is empty string', async () => {
        const customerRes = await createCustomer(clients.fieldOfficer);
        const cId = customerRes['customer']?.['id'] ?? customerRes['id'];
        const res = await clients.manager
          .post(`/customers/${cId}/blacklist`)
          .send({ reason: '' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/customers/${blacklistCustomerId}/blacklist`)
          .send({ reason: 'Unauth blacklist' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /customers/:id/reinstate — Response Shape ────────────────────

  describe('POST /customers/:id/reinstate', () => {
    let reinstateCustomerId: string;

    beforeAll(async () => {
      const customerRes = await createCustomer(clients.fieldOfficer);
      reinstateCustomerId = customerRes['customer']?.['id'] ?? customerRes['id'];
      // Blacklist first so we can reinstate
      await clients.manager
        .post(`/customers/${reinstateCustomerId}/blacklist`)
        .send({ reason: 'Pre-reinstate blacklist' });
    });

    describe('response shape', () => {
      it('should return updated customer with active status', async () => {
        const res = await clients.manager
          .post(`/customers/${reinstateCustomerId}/reinstate`)
          .send({ reason: 'Contract test reinstate' });

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(res.body.status).toBe('active');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when reason is missing', async () => {
        // Create and blacklist a new customer for this test
        const customerRes = await createCustomer(clients.fieldOfficer);
        const cId = customerRes['customer']?.['id'] ?? customerRes['id'];
        await clients.manager
          .post(`/customers/${cId}/blacklist`)
          .send({ reason: 'For reinstate validation test' });

        const res = await clients.manager
          .post(`/customers/${cId}/reinstate`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/customers/${reinstateCustomerId}/reinstate`)
          .send({ reason: 'Unauth reinstate' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /customers/:id/family-members — Response Shape ──────────────

  describe('POST /customers/:id/family-members', () => {
    describe('response shape', () => {
      it('should return created family member with expected fields', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/family-members`)
          .send({
            name: 'Contract Family Member',
            relationship: 'spouse',
            contactNumber: `9${Date.now().toString().slice(-9)}`,
          });

        expect(res.status).toBe(201);
        expect(typeof res.body.id).toBe('string');
        expect(typeof res.body.name).toBe('string');
        expect(typeof res.body.relationship).toBe('string');
        expect(res.body).toHaveProperty('customer_id');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when name is missing', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/family-members`)
          .send({ relationship: 'spouse' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when relationship is missing', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/family-members`)
          .send({ name: 'No Relationship' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 for invalid contact number format', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/family-members`)
          .send({
            name: 'Bad Contact',
            relationship: 'sibling',
            contactNumber: '12345',
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when body is empty', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/family-members`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/customers/${testCustomerId}/family-members`)
          .send({ name: 'Unauth Member', relationship: 'spouse' });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /customers/:id/guarantors — Response Shape ──────────────────

  describe('POST /customers/:id/guarantors', () => {
    describe('response shape', () => {
      it('should return created guarantor with expected fields', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/guarantors`)
          .send({
            name: 'Contract Guarantor',
            relationship: 'friend',
            mobile: `9${Date.now().toString().slice(-9)}`,
            aadhaarNumber: `3${Date.now().toString().slice(-11).padStart(11, '0')}`,
            address: '789 Guarantor Lane, TestCity',
          });

        expect(res.status).toBe(201);
        expect(typeof res.body.id).toBe('string');
        expect(typeof res.body.name).toBe('string');
        expect(typeof res.body.relationship).toBe('string');
        expect(res.body).toHaveProperty('customer_id');
        expect(res.body).toHaveProperty('aadhaar_last_four');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when name is missing', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/guarantors`)
          .send({
            relationship: 'friend',
            mobile: '9876543210',
            aadhaarNumber: '345678901234',
            address: '789 Street',
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 for invalid Aadhaar format', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/guarantors`)
          .send({
            name: 'Bad Aadhaar Guarantor',
            relationship: 'friend',
            mobile: '9876543210',
            aadhaarNumber: '12345',
            address: '789 Street',
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 for invalid mobile format', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/guarantors`)
          .send({
            name: 'Bad Mobile Guarantor',
            relationship: 'friend',
            mobile: '12345',
            aadhaarNumber: '345678901234',
            address: '789 Street',
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when address is missing', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/guarantors`)
          .send({
            name: 'No Address Guarantor',
            relationship: 'friend',
            mobile: '9876543210',
            aadhaarNumber: '345678901234',
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });

      it('should return 400 when body is empty', async () => {
        const res = await clients.fieldOfficer
          .post(`/customers/${testCustomerId}/guarantors`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/customers/${testCustomerId}/guarantors`)
          .send({
            name: 'Unauth Guarantor',
            relationship: 'friend',
            mobile: '9876543210',
            aadhaarNumber: '345678901234',
            address: '789 Street',
          });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
});
