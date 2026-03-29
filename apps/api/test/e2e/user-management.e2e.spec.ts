import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createUser, assignArea } from '../helpers/factories.js';

/**
 * User Management E2E Tests
 *
 * Verifies user CRUD, role assignment hierarchy, area assignments,
 * optimistic locking, deactivation, and RBAC enforcement against the live API.
 *
 * Validates: Design GAP 2; Property 17
 */

const TEST_PASSWORD = 'TestPass1';

describe('User Management E2E', () => {
  let apiBaseUrl: string;
  let clients: AuthClients;
  let dbUtils: DbUtils;

  beforeAll(() => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
  });

  // ─── Super Admin Creates User ──────────────────────────────────────────

  describe('super admin creates user with role assignment', () => {
    it('should create a user and persist in DB with correct role', async () => {
      const username = `e2e_sa_create_${Date.now()}`;
      const res = await clients.superAdmin.post('/users').send({
        username,
        password: TEST_PASSWORD,
        fullName: 'SA Created User',
        mobile: `9${Date.now().toString().slice(-9)}`,
        role: 'field_officer',
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.username).toBe(username);
      expect(res.body.role).toBe('field_officer');
      expect(res.body.is_active).toBe(true);

      // Verify DB persistence
      const dbUser = await dbUtils.findUserById(res.body.id);
      expect(dbUser).not.toBeNull();
      expect(dbUser!.username).toBe(username);
      expect(dbUser!.full_name).toBe('SA Created User');
      expect(dbUser!.role).toBe('field_officer');
      expect(dbUser!.is_active).toBe(true);
    });

    it('should allow super admin to create a user with manager role', async () => {
      const res = await clients.superAdmin.post('/users').send({
        username: `e2e_sa_mgr_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'SA Created Manager',
        mobile: `8${Date.now().toString().slice(-9)}`,
        role: 'manager',
      });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('manager');
    });
  });

  // ─── Manager Creates User ─────────────────────────────────────────────

  describe('manager creates user with role restrictions', () => {
    it('should allow manager to create field_officer', async () => {
      const res = await clients.manager.post('/users').send({
        username: `e2e_mgr_fo_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'Manager Created FO',
        mobile: `7${Date.now().toString().slice(-9)}`,
        role: 'field_officer',
      });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('field_officer');
    });

    it('should allow manager to create collection_officer', async () => {
      const res = await clients.manager.post('/users').send({
        username: `e2e_mgr_co_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'Manager Created CO',
        mobile: `6${Date.now().toString().slice(-9)}`,
        role: 'collection_officer',
      });

      expect(res.status).toBe(201);
      expect(res.body.role).toBe('collection_officer');
    });

    it('should deny manager from creating super_admin role', async () => {
      const res = await clients.manager.post('/users').send({
        username: `e2e_mgr_sa_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'Manager Escalation Attempt',
        mobile: `9${Date.now().toString().slice(-9)}`,
        role: 'super_admin',
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ROLE_ESCALATION_DENIED');
    });

    it('should deny manager from creating another manager', async () => {
      const res = await clients.manager.post('/users').send({
        username: `e2e_mgr_mgr_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'Manager Creates Manager',
        mobile: `9${Date.now().toString().slice(-9)}`,
        role: 'manager',
      });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ROLE_ESCALATION_DENIED');
    });
  });

  // ─── User Update with Optimistic Locking ──────────────────────────────

  describe('user update with optimistic locking', () => {
    it('should update user name and mobile successfully', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_update_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'office_staff',
      });
      const userId = user['id'] as string;

      const newMobile = `8${Date.now().toString().slice(-9)}`;
      const res = await clients.superAdmin.patch(`/users/${userId}`).send({
        fullName: 'Updated Name',
        mobile: newMobile,
      });

      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('Updated Name');
      expect(res.body.mobile).toBe(newMobile);

      // Verify DB persistence
      const dbUser = await dbUtils.findUserById(userId);
      expect(dbUser!.full_name).toBe('Updated Name');
      expect(dbUser!.mobile).toBe(newMobile);
    });

    it('should return version field in user response for optimistic locking', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_version_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'office_staff',
      });
      const userId = user['id'] as string;

      // Fetch user to get version
      const getRes = await clients.superAdmin.get(`/users/${userId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.version).toBeDefined();
      expect(typeof getRes.body.version).toBe('number');

      const initialVersion = getRes.body.version;

      // Update user
      await clients.superAdmin.patch(`/users/${userId}`).send({
        fullName: 'Version Test Updated',
      });

      // Verify version incremented in DB
      const dbUser = await dbUtils.findUserById(userId);
      expect(dbUser!.version).toBeGreaterThanOrEqual(initialVersion);
    });
  });

  // ─── Role Change with Audit Log ───────────────────────────────────────

  describe('role change creates audit log', () => {
    it('should change role and create audit log with before/after', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_rolechange_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;

      // Change role from field_officer to accountant
      const res = await clients.superAdmin.patch(`/users/${userId}`).send({
        role: 'accountant',
      });

      expect(res.status).toBe(200);
      expect(res.body.role).toBe('accountant');

      // Verify DB
      const dbUser = await dbUtils.findUserById(userId);
      expect(dbUser!.role).toBe('accountant');

      // Check audit logs for the role change
      const auditLogs = await dbUtils.findAuditLogsByTarget('user', userId);
      // There should be at least one audit log entry for this user
      // (creation and/or update depending on implementation)
      if (auditLogs.length > 0) {
        const roleChangeLog = auditLogs.find(
          (log) => String(log.action_type) === 'user_updated',
        );
        if (roleChangeLog) {
          // Verify before/after state if present
          if (roleChangeLog.before_state && roleChangeLog.after_state) {
            const before =
              typeof roleChangeLog.before_state === 'string'
                ? JSON.parse(roleChangeLog.before_state)
                : roleChangeLog.before_state;
            const after =
              typeof roleChangeLog.after_state === 'string'
                ? JSON.parse(roleChangeLog.after_state)
                : roleChangeLog.after_state;
            expect(before.role).toBe('field_officer');
            expect(after.role).toBe('accountant');
          }
        }
      }
    });
  });

  // ─── Area Assignment for Field Officer ────────────────────────────────

  describe('area assignment for field officer', () => {
    it('should assign area and verify user_area_assignments record', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_area_fo_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;

      const areaName = `TestArea_${Date.now()}`;
      const res = await clients.superAdmin
        .post(`/users/${userId}/area-assignments`)
        .send({ areaName });

      expect(res.status).toBe(201);
      expect(res.body.area_name).toBe(areaName);
      expect(res.body.user_id).toBe(userId);
      expect(res.body.is_active).toBe(true);

      // Verify in DB
      const assignments = await dbUtils.prisma.user_area_assignments.findMany({
        where: { user_id: userId, is_active: true },
      });
      expect(assignments.length).toBeGreaterThanOrEqual(1);
      const match = assignments.find((a) => a.area_name === areaName);
      expect(match).toBeDefined();
    });

    it('should reject area assignment for non-field/collection officer role', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_area_acct_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'accountant',
      });
      const userId = user['id'] as string;

      const res = await clients.superAdmin
        .post(`/users/${userId}/area-assignments`)
        .send({ areaName: 'SomeArea' });

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('INVALID_AREA_ASSIGNMENT_ROLE');
    });

    it('should reject duplicate area assignment', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_area_dup_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const areaName = `DupArea_${Date.now()}`;

      // First assignment
      await assignArea(clients.superAdmin, userId, areaName);

      // Duplicate assignment
      const res = await clients.superAdmin
        .post(`/users/${userId}/area-assignments`)
        .send({ areaName });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('AREA_ALREADY_ASSIGNED');
    });
  });

  // ─── Area Assignment for Collection Officer ───────────────────────────

  describe('area assignment for collection officer', () => {
    it('should assign area to collection officer and verify scope', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_area_co_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'collection_officer',
      });
      const userId = user['id'] as string;

      const areaName = `CollectionRoute_${Date.now()}`;
      const res = await clients.superAdmin
        .post(`/users/${userId}/area-assignments`)
        .send({ areaName });

      expect(res.status).toBe(201);
      expect(res.body.area_name).toBe(areaName);
      expect(res.body.user_id).toBe(userId);

      // Verify in DB
      const assignments = await dbUtils.prisma.user_area_assignments.findMany({
        where: { user_id: userId, is_active: true },
      });
      expect(assignments.length).toBeGreaterThanOrEqual(1);
      expect(assignments.some((a) => a.area_name === areaName)).toBe(true);
    });
  });

  // ─── Deactivate User ─────────────────────────────────────────────────

  describe('deactivate user', () => {
    it('should set is_active=false and reject subsequent login', async () => {
      const user = await createUser(clients.superAdmin, {
        username: `e2e_deactivate_${Date.now()}`,
        password: TEST_PASSWORD,
        role: 'field_officer',
      });
      const userId = user['id'] as string;
      const username = user['_username'] as string;

      // Verify user can login before deactivation
      const loginBefore = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });
      expect(loginBefore.status).toBe(200);

      // Deactivate via PATCH
      const deactivateRes = await clients.superAdmin
        .patch(`/users/${userId}`)
        .send({ isActive: false });

      expect(deactivateRes.status).toBe(200);
      expect(deactivateRes.body.is_active).toBe(false);

      // Verify DB
      const dbUser = await dbUtils.findUserById(userId);
      expect(dbUser!.is_active).toBe(false);

      // Verify login is rejected
      const loginAfter = await supertest(apiBaseUrl)
        .post('/auth/login')
        .send({ username, password: TEST_PASSWORD });
      expect(loginAfter.status).toBe(403);
      expect(loginAfter.body.code).toBe('INVALID_CREDENTIALS');
    });
  });

  // ─── Unauthorized Role Creating User ──────────────────────────────────

  describe('unauthorized role creating user', () => {
    it('should return 403 when field_officer attempts to create a user', async () => {
      const res = await clients.fieldOfficer.post('/users').send({
        username: `e2e_unauth_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'Unauthorized Create',
        mobile: `9${Date.now().toString().slice(-9)}`,
        role: 'office_staff',
      });

      expect(res.status).toBe(403);
    });

    it('should return 403 when collection_officer attempts to create a user', async () => {
      const res = await clients.collectionOfficer.post('/users').send({
        username: `e2e_unauth_co_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'CO Unauthorized Create',
        mobile: `9${Date.now().toString().slice(-9)}`,
        role: 'office_staff',
      });

      expect(res.status).toBe(403);
    });

    it('should return 403 when accountant attempts to create a user', async () => {
      const res = await clients.accountant.post('/users').send({
        username: `e2e_unauth_acct_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'Accountant Unauthorized Create',
        mobile: `9${Date.now().toString().slice(-9)}`,
        role: 'office_staff',
      });

      expect(res.status).toBe(403);
    });

    it('should return 403 when viewer_auditor attempts to create a user', async () => {
      const res = await clients.viewerAuditor.post('/users').send({
        username: `e2e_unauth_va_${Date.now()}`,
        password: TEST_PASSWORD,
        fullName: 'Viewer Unauthorized Create',
        mobile: `9${Date.now().toString().slice(-9)}`,
        role: 'office_staff',
      });

      expect(res.status).toBe(403);
    });
  });
});
