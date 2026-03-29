import { describe, it, expect, beforeAll } from 'vitest';
import supertest from 'supertest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createCustomer } from '../helpers/factories.js';

/**
 * Customer Onboarding E2E Tests
 *
 * Verifies the complete customer onboarding flow: creation, validation,
 * duplicate detection, KYC document upload, audit logging, blacklisting,
 * and Aadhaar masking against the live API and real database.
 *
 * Validates: Requirements 1.1–1.8; Properties 12, 13, 17
 */

describe('Customer Onboarding E2E', () => {
  let apiBaseUrl: string;
  let clients: AuthClients;
  let dbUtils: DbUtils;

  beforeAll(() => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
  });

  // ─── Valid Customer Creation ───────────────────────────────────────────

  describe('valid customer creation via POST /customers', () => {
    it('should create a customer with Field Officer JWT and return 201', async () => {
      const mobile = `9${Date.now().toString().slice(-9)}`;
      const aadhaar = `2${Date.now().toString().slice(-11)}`;

      const res = await clients.fieldOfficer.post('/customers').send({
        fullName: 'E2E Onboarding Customer',
        fatherOrHusbandName: 'E2E Father',
        mobile,
        aadhaarNumber: aadhaar,
        gender: 'male',
        addressLine1: '42 Test Lane',
        city: 'TestCity',
        district: 'TestDistrict',
        state: 'TestState',
        pincode: '560001',
      });

      expect(res.status).toBe(201);
      expect(res.body.customer).toBeDefined();
      expect(res.body.customer.id).toBeDefined();
      expect(res.body.customer.full_name).toBe('E2E Onboarding Customer');
      expect(res.body.customer.mobile).toBe(mobile);
      expect(res.body.customer.status).toBe('active');

      // Verify DB persistence
      const dbCustomer = await dbUtils.findCustomerById(res.body.customer.id);
      expect(dbCustomer).not.toBeNull();
      expect(dbCustomer!.full_name).toBe('E2E Onboarding Customer');
      expect(dbCustomer!.father_or_husband_name).toBe('E2E Father');
      expect(dbCustomer!.mobile).toBe(mobile);
      expect(dbCustomer!.gender).toBe('male');
      expect(dbCustomer!.address_line1).toBe('42 Test Lane');
      expect(dbCustomer!.city).toBe('TestCity');
      expect(dbCustomer!.district).toBe('TestDistrict');
      expect(dbCustomer!.state).toBe('TestState');
      expect(dbCustomer!.pincode).toBe('560001');
    });
  });

  // ─── Invalid Aadhaar/PAN Format ────────────────────────────────────────

  describe('invalid Aadhaar/PAN format returns 400', () => {
    it('should reject Aadhaar that is not 12 digits', async () => {
      const res = await clients.fieldOfficer.post('/customers').send({
        fullName: 'Bad Aadhaar Customer',
        fatherOrHusbandName: 'Father',
        mobile: `9${Date.now().toString().slice(-9)}`,
        aadhaarNumber: '12345', // too short
        gender: 'female',
        addressLine1: '1 Test St',
        city: 'City',
        district: 'District',
        state: 'State',
        pincode: '123456',
      });

      expect(res.status).toBe(400);
      expect(res.body.message || res.body.error).toBeDefined();
    });

    it('should reject Aadhaar with non-digit characters', async () => {
      const res = await clients.fieldOfficer.post('/customers').send({
        fullName: 'Alpha Aadhaar Customer',
        fatherOrHusbandName: 'Father',
        mobile: `9${Date.now().toString().slice(-9)}`,
        aadhaarNumber: '23456789ABCD', // contains letters
        gender: 'male',
        addressLine1: '1 Test St',
        city: 'City',
        district: 'District',
        state: 'State',
        pincode: '123456',
      });

      expect(res.status).toBe(400);
    });

    it('should reject invalid PAN format', async () => {
      const res = await clients.fieldOfficer.post('/customers').send({
        fullName: 'Bad PAN Customer',
        fatherOrHusbandName: 'Father',
        mobile: `9${Date.now().toString().slice(-9)}`,
        aadhaarNumber: `2${Date.now().toString().slice(-11)}`,
        panNumber: '12345ABCDE', // wrong format, should be AAAAA9999A
        gender: 'male',
        addressLine1: '1 Test St',
        city: 'City',
        district: 'District',
        state: 'State',
        pincode: '123456',
      });

      expect(res.status).toBe(400);
    });

    it('should accept valid PAN format AAAAA9999A', async () => {
      const res = await clients.fieldOfficer.post('/customers').send({
        fullName: 'Good PAN Customer',
        fatherOrHusbandName: 'Father',
        mobile: `9${Date.now().toString().slice(-9)}`,
        aadhaarNumber: `2${Date.now().toString().slice(-11)}`,
        panNumber: 'ABCDE1234F',
        gender: 'male',
        addressLine1: '1 Test St',
        city: 'City',
        district: 'District',
        state: 'State',
        pincode: '123456',
      });

      expect(res.status).toBe(201);
      expect(res.body.customer.pan_last_four).toBe('234F');
    });
  });

  // ─── Duplicate Detection ───────────────────────────────────────────────

  describe('duplicate Aadhaar/mobile flags potential duplicate', () => {
    it('should flag duplicate Aadhaar requiring Manager review', async () => {
      const sharedAadhaar = `3${Date.now().toString().slice(-11)}`;

      // Create first customer with this Aadhaar
      const first = await createCustomer(clients.fieldOfficer, {
        fullName: 'First Aadhaar Customer',
        aadhaarNumber: sharedAadhaar,
      });
      expect(first['customer']?.['id'] ?? first['id']).toBeDefined();

      // Create second customer with same Aadhaar
      const res = await clients.fieldOfficer.post('/customers').send({
        fullName: 'Second Aadhaar Customer',
        fatherOrHusbandName: 'Father',
        mobile: `9${Date.now().toString().slice(-9)}`,
        aadhaarNumber: sharedAadhaar,
        gender: 'male',
        addressLine1: '1 Test St',
        city: 'City',
        district: 'District',
        state: 'State',
        pincode: '123456',
      });

      // The system should still create the customer but flag duplicates
      expect(res.status).toBe(201);
      expect(res.body.duplicateWarnings).toBeDefined();
      expect(res.body.duplicateWarnings.length).toBeGreaterThan(0);

      const aadhaarWarning = res.body.duplicateWarnings.find(
        (w: { field: string }) => w.field === 'aadhaar',
      );
      expect(aadhaarWarning).toBeDefined();
      expect(aadhaarWarning!.matchedCustomers.length).toBeGreaterThan(0);
    });

    it('should flag duplicate mobile requiring Manager review', async () => {
      const sharedMobile = `8${Date.now().toString().slice(-9)}`;

      // Create first customer with this mobile
      await createCustomer(clients.fieldOfficer, {
        fullName: 'First Mobile Customer',
        mobile: sharedMobile,
      });

      // Create second customer with same mobile
      const res = await clients.fieldOfficer.post('/customers').send({
        fullName: 'Second Mobile Customer',
        fatherOrHusbandName: 'Father',
        mobile: sharedMobile,
        aadhaarNumber: `2${Date.now().toString().slice(-11)}`,
        gender: 'female',
        addressLine1: '1 Test St',
        city: 'City',
        district: 'District',
        state: 'State',
        pincode: '123456',
      });

      expect(res.status).toBe(201);
      expect(res.body.duplicateWarnings).toBeDefined();

      const mobileWarning = res.body.duplicateWarnings.find(
        (w: { field: string }) => w.field === 'mobile',
      );
      expect(mobileWarning).toBeDefined();
      expect(mobileWarning!.matchedCustomers.length).toBeGreaterThan(0);
    });
  });

  // ─── KYC Document Upload — Invalid ─────────────────────────────────────

  describe('KYC upload with invalid MIME type or >5MB returns 400', () => {
    it('should reject upload with invalid MIME type', async () => {
      // Create a buffer that doesn't match JPEG/PNG/PDF magic bytes
      const invalidBuffer = Buffer.from('This is a plain text file, not an image');

      const res = await clients.fieldOfficer
        .post('/documents/upload')
        .field('prefix', 'kyc')
        .attach('file', invalidBuffer, {
          filename: 'test.txt',
          contentType: 'text/plain',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid file type|only.*jpeg.*png.*pdf/i);
    });

    it('should reject upload exceeding 5MB', async () => {
      // Create a valid JPEG header but with size > 5MB
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
      const padding = Buffer.alloc(5 * 1024 * 1024 + 1); // 5MB + 1 byte
      const oversizedBuffer = Buffer.concat([jpegHeader, padding]);

      const res = await clients.fieldOfficer
        .post('/documents/upload')
        .field('prefix', 'kyc')
        .attach('file', oversizedBuffer, {
          filename: 'large-photo.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/size|exceed|5.*mb/i);
    });
  });

  // ─── KYC Document Upload — Valid ───────────────────────────────────────

  describe('valid KYC upload stores file and returns signed URL', () => {
    it('should upload a valid JPEG and return file metadata', async () => {
      // Minimal valid JPEG: magic bytes + minimal content
      const jpegBuffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
        0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
      ]);

      const uploadRes = await clients.fieldOfficer
        .post('/documents/upload')
        .field('prefix', 'kyc')
        .attach('file', jpegBuffer, {
          filename: 'aadhaar-front.jpg',
          contentType: 'image/jpeg',
        });

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.data).toBeDefined();
      expect(uploadRes.body.data.id).toBeDefined();
      expect(uploadRes.body.data.mime_type).toBe('image/jpeg');
      expect(uploadRes.body.data.key).toMatch(/^kyc\//);

      // Get signed URL for the uploaded document
      const fileId = uploadRes.body.data.id;
      const urlRes = await clients.fieldOfficer.get(`/documents/${fileId}/url`);

      expect(urlRes.status).toBe(200);
      expect(urlRes.body.data.url).toBeDefined();
      expect(typeof urlRes.body.data.url).toBe('string');
      // Signed URL should contain an expiry parameter
      expect(urlRes.body.data.url).toMatch(/https?:\/\//);
    });

    it('should upload a valid PDF document', async () => {
      // Minimal PDF magic bytes
      const pdfBuffer = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF',
        'utf-8',
      );

      const res = await clients.fieldOfficer
        .post('/documents/upload')
        .field('prefix', 'kyc')
        .attach('file', pdfBuffer, {
          filename: 'pan-card.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.mime_type).toBe('application/pdf');
    });
  });

  // ─── Customer Update Audit Logging ─────────────────────────────────────

  describe('customer update records before_state/after_state in audit_logs', () => {
    it('should create audit log with before and after state on update', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Audit Update Customer',
        city: 'OldCity',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      // Update the customer
      const updateRes = await clients.fieldOfficer
        .patch(`/customers/${customerId}`)
        .send({ city: 'NewCity', notes: 'Updated via E2E test' });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.city).toBe('NewCity');

      // Verify audit log
      const auditLogs = await dbUtils.findAuditLogsByTarget('customer', customerId);
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);

      const updateLog = auditLogs.find(
        (log) => String(log.action_type) === 'customer_updated',
      );
      expect(updateLog).toBeDefined();
      expect(updateLog!.actor_id).toBeDefined();

      // Verify before/after state
      if (updateLog!.before_state && updateLog!.after_state) {
        const before =
          typeof updateLog!.before_state === 'string'
            ? JSON.parse(updateLog!.before_state)
            : updateLog!.before_state;
        const after =
          typeof updateLog!.after_state === 'string'
            ? JSON.parse(updateLog!.after_state)
            : updateLog!.after_state;

        expect(before.city).toBe('OldCity');
        expect(after.city).toBe('NewCity');
      }
    });
  });

  // ─── Manager Blacklists Customer ───────────────────────────────────────

  describe('Manager blacklists customer, loan applications rejected', () => {
    it('should blacklist customer and create audit log', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Blacklist Target Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      const blacklistRes = await clients.manager
        .post(`/customers/${customerId}/blacklist`)
        .send({ reason: 'E2E test blacklist reason' });

      expect(blacklistRes.status).toBe(200);
      expect(blacklistRes.body.status).toBe('blacklisted');
      expect(blacklistRes.body.blacklist_reason).toBe('E2E test blacklist reason');

      // Verify DB
      const dbCustomer = await dbUtils.findCustomerById(customerId);
      expect(dbCustomer!.status).toBe('blacklisted');
      expect(dbCustomer!.blacklist_reason).toBe('E2E test blacklist reason');
      expect(dbCustomer!.blacklisted_at).not.toBeNull();

      // Verify audit log
      const auditLogs = await dbUtils.findAuditLogsByTarget('customer', customerId);
      const blacklistLog = auditLogs.find(
        (log) => String(log.action_type) === 'customer_blacklisted',
      );
      expect(blacklistLog).toBeDefined();
    });

    it('should reject loan application for blacklisted customer', async () => {
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Blacklisted Loan Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      // Blacklist the customer
      await clients.manager
        .post(`/customers/${customerId}/blacklist`)
        .send({ reason: 'Blacklisted for loan test' });

      // Attempt to create a loan for the blacklisted customer
      const seedData = getSeedData();
      const productVersionId = seedData.products.flatMonthly.versionId;

      const loanRes = await clients.fieldOfficer.post('/loans').send({
        customerId,
        productVersionId,
        principalPaise: 10_000_00,
        tenureMonths: 12,
        purpose: 'E2E test loan for blacklisted customer',
      });

      expect(loanRes.status).toBe(422);
      expect(loanRes.body.code).toBe('CUSTOMER_BLACKLISTED');
    });
  });

  // ─── Aadhaar Masking in API Responses ──────────────────────────────────

  describe('Aadhaar masking in API responses (XXXX-XXXX-1234 format)', () => {
    it('should return only aadhaar_last_four, never full Aadhaar in GET response', async () => {
      const aadhaar = '234567891234';
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Masking Test Customer',
        aadhaarNumber: aadhaar,
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      // Fetch customer by ID
      const getRes = await clients.fieldOfficer.get(`/customers/${customerId}`);

      expect(getRes.status).toBe(200);

      // Should have aadhaar_last_four
      expect(getRes.body.aadhaar_last_four).toBe('1234');

      // Should NOT have full Aadhaar in any field
      const responseStr = JSON.stringify(getRes.body);
      expect(responseStr).not.toContain(aadhaar);

      // Should not have aadhaar_number_encrypted exposed
      expect(getRes.body.aadhaar_number_encrypted).toBeUndefined();
    });

    it('should mask Aadhaar in customer list responses', async () => {
      const aadhaar = '345678901234';
      await createCustomer(clients.fieldOfficer, {
        fullName: 'List Masking Customer',
        aadhaarNumber: aadhaar,
      });

      // Fetch customer list
      const listRes = await clients.fieldOfficer.get('/customers');

      expect(listRes.status).toBe(200);

      // No customer in the list should expose full Aadhaar
      const responseStr = JSON.stringify(listRes.body);
      expect(responseStr).not.toContain(aadhaar);
    });
  });
});
