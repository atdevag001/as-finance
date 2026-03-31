import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createCustomer, createGroup } from '../helpers/factories.js';

/**
 * Group API Contract Tests
 *
 * Verifies request/response shapes, validation errors (400), and auth errors (401)
 * for all group endpoints: GET /groups, POST /groups, GET /groups/:id,
 * POST /groups/:id/members, DELETE /groups/:id/members/:memberId,
 * POST /groups/:id/collections.
 *
 * Validates: Requirements 40.13, 40.18, 40.19
 */

describe('Group Contract Tests', () => {
  let apiBaseUrl: string;
  let clients: AuthClients;
  let testGroupId: string;
  let testLeaderId: string;
  let testMemberId: string; // group_members row ID

  beforeAll(async () => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);

    // Create a leader customer
    const leaderRes = await createCustomer(clients.fieldOfficer, { fullName: 'Group Leader' });
    testLeaderId = leaderRes['customer']?.['id'] ?? leaderRes['id'];

    // Create a group for read/member tests
    const groupRes = await createGroup(clients.fieldOfficer, { leaderId: testLeaderId });
    testGroupId = groupRes['id'];

    // Create a member customer and add to group
    const memberRes = await createCustomer(clients.fieldOfficer, { fullName: 'Group Member' });
    const memberCustomerId = memberRes['customer']?.['id'] ?? memberRes['id'];
    const addRes = await clients.fieldOfficer
      .post(`/groups/${testGroupId}/members`)
      .send({ customerId: memberCustomerId });
    testMemberId = addRes.body['id'];
  });

  // ─── POST /groups — Response Shape ──────────────────────────────────────

  describe('POST /groups', () => {
    describe('response shape', () => {
      it('should return group object with expected fields on success', async () => {
        const leaderRes = await createCustomer(clients.fieldOfficer, { fullName: 'New Leader' });
        const leaderId = leaderRes['customer']?.['id'] ?? leaderRes['id'];

        const res = await clients.fieldOfficer.post('/groups').send({
          name: `Contract Group ${Date.now()}`,
          meetingDay: 'monday',
          branchArea: 'ContractArea',
          leaderId,
        });

        expect(res.status).toBe(201);
        expect(typeof res.body.id).toBe('string');
        expect(typeof res.body.name).toBe('string');
        expect(res.body).toHaveProperty('meeting_day');
        expect(res.body).toHaveProperty('branch_area');
        expect(res.body).toHaveProperty('leader_id');
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('created_at');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.fieldOfficer.post('/groups').send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when name is missing', async () => {
        const res = await clients.fieldOfficer.post('/groups').send({
          meetingDay: 'monday',
          branchArea: 'Area',
          leaderId: testLeaderId,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when meetingDay is invalid', async () => {
        const res = await clients.fieldOfficer.post('/groups').send({
          name: 'Bad Day Group',
          meetingDay: 'funday',
          branchArea: 'Area',
          leaderId: testLeaderId,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when leaderId is not a valid UUID', async () => {
        const res = await clients.fieldOfficer.post('/groups').send({
          name: 'Bad Leader Group',
          meetingDay: 'tuesday',
          branchArea: 'Area',
          leaderId: 'not-a-uuid',
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when branchArea is missing', async () => {
        const res = await clients.fieldOfficer.post('/groups').send({
          name: 'No Area Group',
          meetingDay: 'wednesday',
          leaderId: testLeaderId,
        });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.post('/groups').send({
          name: 'Unauth Group',
          meetingDay: 'monday',
          branchArea: 'Area',
          leaderId: testLeaderId,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired.post('/groups').send({
          name: 'Expired Group',
          meetingDay: 'monday',
          branchArea: 'Area',
          leaderId: testLeaderId,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });

      it('should return 401 when token is tampered', async () => {
        const res = await clients.tampered.post('/groups').send({
          name: 'Tampered Group',
          meetingDay: 'monday',
          branchArea: 'Area',
          leaderId: testLeaderId,
        });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /groups — Response Shape ───────────────────────────────────────

  describe('GET /groups', () => {
    describe('response shape', () => {
      it('should return paginated list with data array and total', async () => {
        const res = await clients.fieldOfficer.get('/groups');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body).toHaveProperty('total');
        expect(typeof res.body.total).toBe('number');
      });

      it('should accept pagination query params', async () => {
        const res = await clients.fieldOfficer.get('/groups?skip=0&take=5');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
        expect(res.body.data.length).toBeLessThanOrEqual(5);
      });

      it('should accept status filter', async () => {
        const res = await clients.fieldOfficer.get('/groups?status=active');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      });

      it('should accept branchArea filter', async () => {
        const res = await clients.fieldOfficer.get('/groups?branchArea=ContractArea');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(Array.isArray(res.body.data)).toBe(true);
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get('/groups');

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── GET /groups/:id — Response Shape ──────────────────────────────────

  describe('GET /groups/:id', () => {
    describe('response shape', () => {
      it('should return group object with expected fields', async () => {
        const res = await clients.fieldOfficer.get(`/groups/${testGroupId}`);

        expect(res.status).toBe(200);
        expect(typeof res.body.id).toBe('string');
        expect(typeof res.body.name).toBe('string');
        expect(res.body).toHaveProperty('meeting_day');
        expect(res.body).toHaveProperty('branch_area');
        expect(res.body).toHaveProperty('leader_id');
        expect(res.body).toHaveProperty('status');
        expect(res.body).toHaveProperty('created_at');
      });

      it('should return 404 for non-existent group', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.fieldOfficer.get(`/groups/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated.get(`/groups/${testGroupId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /groups/:id/members — Response Shape ─────────────────────────

  describe('POST /groups/:id/members', () => {
    describe('response shape', () => {
      it('should return created member with expected fields', async () => {
        const memberRes = await createCustomer(clients.fieldOfficer, { fullName: 'New Member' });
        const customerId = memberRes['customer']?.['id'] ?? memberRes['id'];

        const res = await clients.fieldOfficer
          .post(`/groups/${testGroupId}/members`)
          .send({ customerId });

        expect(res.status).toBe(201);
        expect(typeof res.body.id).toBe('string');
        expect(res.body).toHaveProperty('group_id');
        expect(res.body).toHaveProperty('customer_id');
      });
    });

    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.fieldOfficer
          .post(`/groups/${testGroupId}/members`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when customerId is not a valid UUID', async () => {
        const res = await clients.fieldOfficer
          .post(`/groups/${testGroupId}/members`)
          .send({ customerId: 'not-a-uuid' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/groups/${testGroupId}/members`)
          .send({ customerId: testLeaderId });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── DELETE /groups/:id/members/:memberId — Response Shape ─────────────

  describe('DELETE /groups/:id/members/:memberId', () => {
    describe('response shape', () => {
      it('should return 200 on successful member removal', async () => {
        // Create a fresh member to remove
        const memberRes = await createCustomer(clients.fieldOfficer, { fullName: 'Removable Member' });
        const customerId = memberRes['customer']?.['id'] ?? memberRes['id'];
        const addRes = await clients.fieldOfficer
          .post(`/groups/${testGroupId}/members`)
          .send({ customerId });
        const memberId = addRes.body['id'];

        const res = await clients.fieldOfficer
          .delete(`/groups/${testGroupId}/members/${memberId}`);

        expect(res.status).toBe(200);
      });

      it('should return 404 for non-existent member', async () => {
        const fakeId = '00000000-0000-0000-0000-000000000000';
        const res = await clients.fieldOfficer
          .delete(`/groups/${testGroupId}/members/${fakeId}`);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('statusCode', 404);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .delete(`/groups/${testGroupId}/members/${testMemberId}`);

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });

  // ─── POST /groups/:id/collections — Response Shape ─────────────────────

  describe('POST /groups/:id/collections', () => {
    describe('validation errors (400)', () => {
      it('should return 400 when body is empty', async () => {
        const res = await clients.collectionOfficer
          .post(`/groups/${testGroupId}/collections`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when totalAmountPaise is missing', async () => {
        const res = await clients.collectionOfficer
          .post(`/groups/${testGroupId}/collections`)
          .send({
            collectionDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: `contract-gc-${Date.now()}`,
            memberBreakdown: [{ loanId: '00000000-0000-0000-0000-000000000001', amountPaise: 1000 }],
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when totalAmountPaise is not a positive integer', async () => {
        const res = await clients.collectionOfficer
          .post(`/groups/${testGroupId}/collections`)
          .send({
            totalAmountPaise: -100,
            collectionDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: `contract-gc-${Date.now()}`,
            memberBreakdown: [{ loanId: '00000000-0000-0000-0000-000000000001', amountPaise: 1000 }],
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when memberBreakdown is empty', async () => {
        const res = await clients.collectionOfficer
          .post(`/groups/${testGroupId}/collections`)
          .send({
            totalAmountPaise: 1000,
            collectionDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: `contract-gc-${Date.now()}`,
            memberBreakdown: [],
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when paymentMode is invalid', async () => {
        const res = await clients.collectionOfficer
          .post(`/groups/${testGroupId}/collections`)
          .send({
            totalAmountPaise: 1000,
            collectionDate: '2024-01-15',
            paymentMode: 'bitcoin',
            idempotencyKey: `contract-gc-${Date.now()}`,
            memberBreakdown: [{ loanId: '00000000-0000-0000-0000-000000000001', amountPaise: 1000 }],
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when collectionDate is invalid', async () => {
        const res = await clients.collectionOfficer
          .post(`/groups/${testGroupId}/collections`)
          .send({
            totalAmountPaise: 1000,
            collectionDate: 'not-a-date',
            paymentMode: 'cash',
            idempotencyKey: `contract-gc-${Date.now()}`,
            memberBreakdown: [{ loanId: '00000000-0000-0000-0000-000000000001', amountPaise: 1000 }],
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 400 when memberBreakdown item has invalid loanId', async () => {
        const res = await clients.collectionOfficer
          .post(`/groups/${testGroupId}/collections`)
          .send({
            totalAmountPaise: 1000,
            collectionDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: `contract-gc-${Date.now()}`,
            memberBreakdown: [{ loanId: 'not-a-uuid', amountPaise: 1000 }],
          });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('statusCode', 400);
        expect(res.body).toHaveProperty('message');
      });
    });

    describe('auth errors (401)', () => {
      it('should return 401 when no token is provided', async () => {
        const res = await clients.unauthenticated
          .post(`/groups/${testGroupId}/collections`)
          .send({
            totalAmountPaise: 1000,
            collectionDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: `contract-gc-unauth-${Date.now()}`,
            memberBreakdown: [{ loanId: '00000000-0000-0000-0000-000000000001', amountPaise: 1000 }],
          });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
        expect(res.body).toHaveProperty('message');
      });

      it('should return 401 when token is expired', async () => {
        const res = await clients.expired
          .post(`/groups/${testGroupId}/collections`)
          .send({
            totalAmountPaise: 1000,
            collectionDate: '2024-01-15',
            paymentMode: 'cash',
            idempotencyKey: `contract-gc-expired-${Date.now()}`,
            memberBreakdown: [{ loanId: '00000000-0000-0000-0000-000000000001', amountPaise: 1000 }],
          });

        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty('statusCode', 401);
      });
    });
  });
});
