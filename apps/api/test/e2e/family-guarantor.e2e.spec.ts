import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer, addFamilyMember, addGuarantor } from '../helpers/factories.js';

/**
 * Family Member and Guarantor E2E Tests
 *
 * Verifies family member addition, guarantor creation with Aadhaar validation,
 * photo upload for guarantors, listing, and Aadhaar masking in API responses
 * against the live API and real database.
 *
 * Validates: Design GAP 19; Property 13
 */

describe('Family Member and Guarantor E2E', () => {
  let clients: AuthClients;
  let dbUtils: DbUtils;

  beforeAll(() => {
    const apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
  });

  // ─── Family Members ────────────────────────────────────────────────────

  describe('add family member with correct relationship', () => {
    it('should add a family member and verify persistence', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Family Member Test Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      const res = await clients.fieldOfficer
        .post(`/customers/${customerId}/family-members`)
        .send({
          name: 'Spouse Name',
          relationship: 'spouse',
          contactNumber: '9876543210',
          occupation: 'Teacher',
          incomeContribution: 'Primary earner',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Spouse Name');
      expect(res.body.relationship).toBe('spouse');
      expect(res.body.contact_number).toBe('9876543210');
      expect(res.body.occupation).toBe('Teacher');
      expect(res.body.income_contribution).toBe('Primary earner');

      // Verify DB persistence
      const dbMembers = await dbUtils.findFamilyMembersByCustomerId(customerId);
      const match = dbMembers.find((m) => m.id === res.body.id);
      expect(match).toBeDefined();
      expect(match!.name).toBe('Spouse Name');
      expect(match!.relationship).toBe('spouse');
      expect(match!.customer_id).toBe(customerId);
    });
  });

  describe('add multiple family members', () => {
    it('should add multiple family members and verify all returned in customer detail', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Multi Family Test Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      // Add three family members with different relationships
      await addFamilyMember(clients.fieldOfficer, customerId, {
        name: 'Father Name',
        relationship: 'father',
      });
      await addFamilyMember(clients.fieldOfficer, customerId, {
        name: 'Mother Name',
        relationship: 'mother',
      });
      await addFamilyMember(clients.fieldOfficer, customerId, {
        name: 'Sibling Name',
        relationship: 'sibling',
      });

      // Fetch customer detail and verify all family members are included
      const getRes = await clients.fieldOfficer.get(`/customers/${customerId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.family_members).toBeDefined();
      expect(getRes.body.family_members.length).toBe(3);

      const names = getRes.body.family_members.map((m: { name: string }) => m.name);
      expect(names).toContain('Father Name');
      expect(names).toContain('Mother Name');
      expect(names).toContain('Sibling Name');

      // Also verify via direct DB query
      const dbMembers = await dbUtils.findFamilyMembersByCustomerId(customerId);
      expect(dbMembers.length).toBe(3);
    });
  });

  // ─── Guarantors ────────────────────────────────────────────────────────

  describe('add guarantor with valid Aadhaar', () => {
    it('should add a guarantor and verify persistence', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Guarantor Test Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];
      const guarantorAadhaar = '345678901234';

      const res = await clients.fieldOfficer
        .post(`/customers/${customerId}/guarantors`)
        .send({
          name: 'Guarantor Person',
          relationship: 'friend',
          mobile: '9123456789',
          aadhaarNumber: guarantorAadhaar,
          address: '789 Guarantor Lane, TestCity',
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('Guarantor Person');
      expect(res.body.relationship).toBe('friend');
      expect(res.body.mobile).toBe('9123456789');
      expect(res.body.aadhaar_last_four).toBe('1234');
      expect(res.body.address).toBe('789 Guarantor Lane, TestCity');

      // Verify DB persistence
      const dbGuarantors = await dbUtils.findGuarantorsByCustomerId(customerId);
      const match = dbGuarantors.find((g) => g.id === res.body.id);
      expect(match).toBeDefined();
      expect(match!.name).toBe('Guarantor Person');
      expect(match!.aadhaar_last_four).toBe('1234');
      expect(match!.aadhaar_number_encrypted).toBeDefined();
      expect(match!.aadhaar_number_encrypted).not.toBe(guarantorAadhaar);
      expect(match!.customer_id).toBe(customerId);
    });
  });

  describe('add guarantor with invalid Aadhaar returns 400', () => {
    it('should reject Aadhaar that is not 12 digits', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Invalid Aadhaar Guarantor Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      const res = await clients.fieldOfficer
        .post(`/customers/${customerId}/guarantors`)
        .send({
          name: 'Bad Aadhaar Guarantor',
          relationship: 'friend',
          mobile: '9123456780',
          aadhaarNumber: '12345', // too short
          address: '123 Test St',
        });

      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    it('should reject Aadhaar with non-digit characters', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Alpha Aadhaar Guarantor Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      const res = await clients.fieldOfficer
        .post(`/customers/${customerId}/guarantors`)
        .send({
          name: 'Alpha Aadhaar Guarantor',
          relationship: 'friend',
          mobile: '9123456781',
          aadhaarNumber: '23456789ABCD', // contains letters
          address: '123 Test St',
        });

      expect(res.status).toBe(400);
    });
  });


  describe('add guarantor with photo upload', () => {
    it('should add a guarantor with photo and verify MinIO storage', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Photo Guarantor Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      // Upload a photo first via the document endpoint
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
      ]);

      const uploadRes = await clients.fieldOfficer
        .post('/documents/upload')
        .field('prefix', 'guarantor-photos')
        .attach('file', jpegBuffer, {
          filename: 'guarantor-photo.jpg',
          contentType: 'image/jpeg',
        });

      expect(uploadRes.status).toBe(201);
      const photoFileId = uploadRes.body.data.id;
      expect(photoFileId).toBeDefined();

      // Add guarantor with the uploaded photo
      const guarantorAadhaar = `4${Date.now().toString().slice(-11)}`;
      const res = await clients.fieldOfficer
        .post(`/customers/${customerId}/guarantors`)
        .send({
          name: 'Photo Guarantor',
          relationship: 'colleague',
          mobile: `8${Date.now().toString().slice(-9)}`,
          aadhaarNumber: guarantorAadhaar,
          address: '321 Photo Lane, TestCity',
          photoFileId,
        });

      expect(res.status).toBe(201);
      expect(res.body.photo_file_id).toBe(photoFileId);

      // Verify the photo is accessible via signed URL
      const urlRes = await clients.fieldOfficer.get(`/documents/${photoFileId}/url`);
      expect(urlRes.status).toBe(200);
      expect(urlRes.body.data.url).toBeDefined();
      expect(urlRes.body.data.url).toMatch(/https?:\/\//);

      // Verify DB persistence includes photo reference
      const dbGuarantors = await dbUtils.findGuarantorsByCustomerId(customerId);
      const match = dbGuarantors.find((g) => g.id === res.body.id);
      expect(match).toBeDefined();
      expect(match!.photo_file_id).toBe(photoFileId);
    });
  });

  describe('list guarantors returns correct data', () => {
    it('should return all guarantors in customer detail response', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'List Guarantors Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      // Add two guarantors
      await addGuarantor(clients.fieldOfficer, customerId, {
        name: 'Guarantor One',
        relationship: 'friend',
      });
      await addGuarantor(clients.fieldOfficer, customerId, {
        name: 'Guarantor Two',
        relationship: 'colleague',
      });

      // Fetch customer detail — guarantors should be included
      const getRes = await clients.fieldOfficer.get(`/customers/${customerId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.guarantors).toBeDefined();
      expect(getRes.body.guarantors.length).toBe(2);

      const names = getRes.body.guarantors.map((g: { name: string }) => g.name);
      expect(names).toContain('Guarantor One');
      expect(names).toContain('Guarantor Two');

      // Each guarantor should have the expected fields
      for (const g of getRes.body.guarantors) {
        expect(g.id).toBeDefined();
        expect(g.name).toBeDefined();
        expect(g.relationship).toBeDefined();
        expect(g.mobile).toBeDefined();
        expect(g.aadhaar_last_four).toBeDefined();
        expect(g.address).toBeDefined();
      }
    });
  });

  describe('guarantor Aadhaar masked in API response', () => {
    it('should return only aadhaar_last_four, never full Aadhaar for guarantors', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Masking Guarantor Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      const guarantorAadhaar = '567890123456';
      await addGuarantor(clients.fieldOfficer, customerId, {
        name: 'Masked Aadhaar Guarantor',
        aadhaarNumber: guarantorAadhaar,
      });

      // Fetch customer detail
      const getRes = await clients.fieldOfficer.get(`/customers/${customerId}`);
      expect(getRes.status).toBe(200);

      const guarantor = getRes.body.guarantors.find(
        (g: { name: string }) => g.name === 'Masked Aadhaar Guarantor',
      );
      expect(guarantor).toBeDefined();

      // Should have aadhaar_last_four
      expect(guarantor.aadhaar_last_four).toBe('3456');

      // Full Aadhaar should NOT appear anywhere in the response
      const responseStr = JSON.stringify(getRes.body);
      expect(responseStr).not.toContain(guarantorAadhaar);

      // Encrypted Aadhaar should not be exposed
      expect(guarantor.aadhaar_number_encrypted).toBeUndefined();
    });

    it('should mask Aadhaar in guarantor creation response', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Creation Masking Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      const guarantorAadhaar = '678901234567';
      const res = await clients.fieldOfficer
        .post(`/customers/${customerId}/guarantors`)
        .send({
          name: 'Creation Masked Guarantor',
          relationship: 'friend',
          mobile: `7${Date.now().toString().slice(-9)}`,
          aadhaarNumber: guarantorAadhaar,
          address: '999 Mask Lane',
        });

      expect(res.status).toBe(201);
      expect(res.body.aadhaar_last_four).toBe('4567');

      // Full Aadhaar should NOT appear in the creation response
      const responseStr = JSON.stringify(res.body);
      expect(responseStr).not.toContain(guarantorAadhaar);
      expect(res.body.aadhaar_number_encrypted).toBeUndefined();
    });
  });
});
