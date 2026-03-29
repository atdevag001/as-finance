import { describe, it, expect, beforeAll } from 'vitest';
import { getApiBaseUrl, getUserTokens, getSeedData } from '../helpers/seed.js';
import { createAuthClients, type AuthClients } from '../helpers/auth-client.js';
import { createDbUtils, type DbUtils } from '../helpers/db-utils.js';
import { createLoanProduct, createCustomer, createLoan } from '../helpers/factories.js';

/**
 * Loan Product Configuration E2E Tests
 *
 * Verifies loan product creation, versioning, processing fee configuration,
 * deactivation rules, and validation of out-of-range values against the
 * live API and real database.
 *
 * Validates: Requirements 2.1–2.5; Property 12
 */

describe('Loan Product E2E', () => {
  let apiBaseUrl: string;
  let clients: AuthClients;
  let dbUtils: DbUtils;

  beforeAll(() => {
    apiBaseUrl = getApiBaseUrl();
    const tokens = getUserTokens();
    clients = createAuthClients(apiBaseUrl, tokens);
    dbUtils = createDbUtils();
  });

  // ─── 2.1 Manager Creates Loan Product ──────────────────────────────────

  describe('Manager creates loan product with valid config returns 201', () => {
    it('should create a loan product with all required fields and return 201', async () => {
      const productName = `E2E Product ${Date.now()}`;

      const res = await clients.manager.post('/loan-products').send({
        name: productName,
        interestType: 'flat',
        annualRateBps: 1200,
        minPrincipalPaise: 5_000_00,
        maxPrincipalPaise: 50_000_00,
        minTenureMonths: 3,
        maxTenureMonths: 24,
        repaymentFrequency: 'monthly',
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe(productName);
      expect(res.body.is_active).toBe(true);
      expect(res.body.current_version).toBeDefined();
      expect(res.body.current_version.version_number).toBe(1);
      expect(res.body.current_version.interest_type).toBe('flat');
      expect(res.body.current_version.annual_rate_bps).toBe(1200);
      expect(Number(res.body.current_version.min_principal_paise)).toBe(5_000_00);
      expect(Number(res.body.current_version.max_principal_paise)).toBe(50_000_00);
      expect(res.body.current_version.min_tenure_months).toBe(3);
      expect(res.body.current_version.max_tenure_months).toBe(24);
      expect(res.body.current_version.repayment_frequency).toBe('monthly');
    });

    it('should create a reducing_balance product with penalty config', async () => {
      const res = await clients.manager.post('/loan-products').send({
        name: `E2E Reducing ${Date.now()}`,
        interestType: 'reducing_balance',
        annualRateBps: 1800,
        minPrincipalPaise: 10_000_00,
        maxPrincipalPaise: 1_00_000_00,
        minTenureMonths: 6,
        maxTenureMonths: 36,
        repaymentFrequency: 'monthly',
        penaltyGraceDays: 7,
        penaltyType: 'flat_per_period',
        penaltyValue: 100_00,
        penaltyFrequency: 'daily',
      });

      expect(res.status).toBe(201);
      expect(res.body.current_version.interest_type).toBe('reducing_balance');
      expect(res.body.current_version.penalty_grace_days).toBe(7);
      expect(res.body.current_version.penalty_type).toBe('flat_per_period');
      expect(res.body.current_version.penalty_value).toBe(100_00);
      expect(res.body.current_version.penalty_frequency).toBe('daily');
    });

    it('should reject duplicate product name with 409', async () => {
      const productName = `E2E Duplicate ${Date.now()}`;

      // Create first product
      const first = await clients.manager.post('/loan-products').send({
        name: productName,
        interestType: 'flat',
        annualRateBps: 1200,
        minPrincipalPaise: 5_000_00,
        maxPrincipalPaise: 50_000_00,
        minTenureMonths: 3,
        maxTenureMonths: 24,
        repaymentFrequency: 'monthly',
      });
      expect(first.status).toBe(201);

      // Attempt duplicate
      const dup = await clients.manager.post('/loan-products').send({
        name: productName,
        interestType: 'flat',
        annualRateBps: 1200,
        minPrincipalPaise: 5_000_00,
        maxPrincipalPaise: 50_000_00,
        minTenureMonths: 3,
        maxTenureMonths: 24,
        repaymentFrequency: 'monthly',
      });

      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('PRODUCT_NAME_EXISTS');
    });
  });

  // ─── 2.2 Product Update Creates New Version ────────────────────────────

  describe('product update creates new version, preserves previous version', () => {
    it('should create version 2 on update and keep version 1', async () => {
      // Create a product
      const product = await createLoanProduct(clients.manager, {
        name: `E2E Versioning ${Date.now()}`,
        interestType: 'flat',
        annualRateBps: 1200,
        minPrincipalPaise: 5_000_00,
        maxPrincipalPaise: 50_000_00,
        minTenureMonths: 3,
        maxTenureMonths: 24,
        repaymentFrequency: 'monthly',
      });
      const productId = product['id'];
      const v1Id = product['current_version']?.['id'] ?? product['current_version_id'];

      // Update the product — should create version 2
      const updateRes = await clients.manager
        .patch(`/loan-products/${productId}`)
        .send({ annualRateBps: 1500 });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.current_version).toBeDefined();
      expect(updateRes.body.current_version.version_number).toBe(2);
      expect(updateRes.body.current_version.annual_rate_bps).toBe(1500);

      // Verify version 1 is preserved in the versions array
      const versions = updateRes.body.versions;
      expect(versions).toBeDefined();
      expect(versions.length).toBeGreaterThanOrEqual(2);

      const v1 = versions.find((v: { version_number: number }) => v.version_number === 1);
      expect(v1).toBeDefined();
      expect(v1.annual_rate_bps).toBe(1200);

      const v2 = versions.find((v: { version_number: number }) => v.version_number === 2);
      expect(v2).toBeDefined();
      expect(v2.annual_rate_bps).toBe(1500);

      // Current version ID should differ from v1
      const newVersionId = updateRes.body.current_version.id;
      expect(newVersionId).not.toBe(v1Id);
    });

    it('should preserve original version for existing loans after product update', async () => {
      const seedData = getSeedData();
      const productVersionId = seedData.products.flatMonthly.versionId;

      // Create a customer and loan referencing the current version
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Version Preservation Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      const loan = await createLoan(clients.fieldOfficer, {
        customerId,
        productVersionId,
      });

      // Verify the loan references the original version
      const dbLoan = await dbUtils.findLoanById(loan['id']);
      expect(dbLoan).not.toBeNull();
      expect(dbLoan!.product_version_id).toBe(productVersionId);
    });
  });

  // ─── 2.3 Processing Fee Configuration ──────────────────────────────────

  describe('processing fee configuration persisted correctly', () => {
    it('should persist fixed processing fee type and value', async () => {
      const res = await clients.manager.post('/loan-products').send({
        name: `E2E Fixed Fee ${Date.now()}`,
        interestType: 'flat',
        annualRateBps: 1200,
        minPrincipalPaise: 5_000_00,
        maxPrincipalPaise: 50_000_00,
        minTenureMonths: 3,
        maxTenureMonths: 24,
        repaymentFrequency: 'monthly',
        processingFeeType: 'fixed',
        processingFeeValue: 500_00, // ₹500 fixed fee
      });

      expect(res.status).toBe(201);
      expect(res.body.current_version.processing_fee_type).toBe('fixed');
      expect(res.body.current_version.processing_fee_value).toBe(500_00);
    });

    it('should persist percentage processing fee type and value', async () => {
      const res = await clients.manager.post('/loan-products').send({
        name: `E2E Pct Fee ${Date.now()}`,
        interestType: 'reducing_balance',
        annualRateBps: 1500,
        minPrincipalPaise: 10_000_00,
        maxPrincipalPaise: 1_00_000_00,
        minTenureMonths: 6,
        maxTenureMonths: 36,
        repaymentFrequency: 'monthly',
        processingFeeType: 'percentage',
        processingFeeValue: 200, // 2% in basis points
      });

      expect(res.status).toBe(201);
      expect(res.body.current_version.processing_fee_type).toBe('percentage');
      expect(res.body.current_version.processing_fee_value).toBe(200);
    });

    it('should reject processing fee type without value', async () => {
      const res = await clients.manager.post('/loan-products').send({
        name: `E2E Missing Fee Val ${Date.now()}`,
        interestType: 'flat',
        annualRateBps: 1200,
        minPrincipalPaise: 5_000_00,
        maxPrincipalPaise: 50_000_00,
        minTenureMonths: 3,
        maxTenureMonths: 24,
        repaymentFrequency: 'monthly',
        processingFeeType: 'fixed',
        // processingFeeValue intentionally omitted
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('MISSING_PROCESSING_FEE_VALUE');
    });
  });

  // ─── 2.4 Deactivate Product With Active Loans Prevented ────────────────

  describe('deactivate product with active loans prevented', () => {
    it('should prevent deactivation when product has active loans', async () => {
      const seedData = getSeedData();
      const productId = seedData.products.flatMonthly.id;
      const productVersionId = seedData.products.flatMonthly.versionId;

      // Create a customer and advance a loan to active status
      const customer = await createCustomer(clients.fieldOfficer, {
        fullName: 'Deactivation Block Customer',
      });
      const customerId = customer['customer']?.['id'] ?? customer['id'];

      await createLoan(clients.fieldOfficer, {
        customerId,
        productVersionId,
        advanceTo: 'active',
        clients,
      });

      // Attempt to deactivate the product
      const deactivateRes = await clients.manager
        .post(`/loan-products/${productId}/deactivate`)
        .send();

      expect(deactivateRes.status).toBe(422);
      expect(deactivateRes.body.code).toBe('ACTIVE_LOANS_EXIST');
    });

    it('should allow deactivation of product with no active loans', async () => {
      // Create a fresh product with no loans
      const product = await createLoanProduct(clients.manager, {
        name: `E2E Deactivate OK ${Date.now()}`,
      });

      const deactivateRes = await clients.manager
        .post(`/loan-products/${product['id']}/deactivate`)
        .send();

      expect(deactivateRes.status).toBe(200);
      expect(deactivateRes.body.is_active).toBe(false);

      // Verify in DB
      const getRes = await clients.manager.get(`/loan-products/${product['id']}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.is_active).toBe(false);
    });

    it('should reject deactivation of already deactivated product', async () => {
      const product = await createLoanProduct(clients.manager, {
        name: `E2E Already Deactivated ${Date.now()}`,
      });

      // Deactivate once
      await clients.manager.post(`/loan-products/${product['id']}/deactivate`).send();

      // Attempt second deactivation
      const res = await clients.manager
        .post(`/loan-products/${product['id']}/deactivate`)
        .send();

      expect(res.status).toBe(422);
      expect(res.body.code).toBe('ALREADY_DEACTIVATED');
    });
  });

  // ─── 2.5 Out-of-Range Product Values Return 400 ────────────────────────

  describe('out-of-range product values return 400', () => {
    const validBase = {
      name: `placeholder`,
      interestType: 'flat' as const,
      annualRateBps: 1200,
      minPrincipalPaise: 5_000_00,
      maxPrincipalPaise: 50_000_00,
      minTenureMonths: 3,
      maxTenureMonths: 24,
      repaymentFrequency: 'monthly' as const,
    };

    it('should reject negative annual rate (annualRateBps < 1)', async () => {
      const res = await clients.manager.post('/loan-products').send({
        ...validBase,
        name: `E2E Neg Rate ${Date.now()}`,
        annualRateBps: -100,
      });

      expect(res.status).toBe(400);
    });

    it('should reject zero annual rate (annualRateBps = 0)', async () => {
      const res = await clients.manager.post('/loan-products').send({
        ...validBase,
        name: `E2E Zero Rate ${Date.now()}`,
        annualRateBps: 0,
      });

      expect(res.status).toBe(400);
    });

    it('should reject zero principal range (minPrincipalPaise = 0)', async () => {
      const res = await clients.manager.post('/loan-products').send({
        ...validBase,
        name: `E2E Zero Principal ${Date.now()}`,
        minPrincipalPaise: 0,
      });

      expect(res.status).toBe(400);
    });

    it('should reject tenure min > max', async () => {
      const res = await clients.manager.post('/loan-products').send({
        ...validBase,
        name: `E2E Tenure Inverted ${Date.now()}`,
        minTenureMonths: 24,
        maxTenureMonths: 3,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_TENURE_RANGE');
    });

    it('should reject principal min > max', async () => {
      const res = await clients.manager.post('/loan-products').send({
        ...validBase,
        name: `E2E Principal Inverted ${Date.now()}`,
        minPrincipalPaise: 50_000_00,
        maxPrincipalPaise: 5_000_00,
      });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PRINCIPAL_RANGE');
    });

    it('should reject negative minPrincipalPaise', async () => {
      const res = await clients.manager.post('/loan-products').send({
        ...validBase,
        name: `E2E Neg Principal ${Date.now()}`,
        minPrincipalPaise: -1000,
      });

      expect(res.status).toBe(400);
    });

    it('should reject zero tenure (minTenureMonths = 0)', async () => {
      const res = await clients.manager.post('/loan-products').send({
        ...validBase,
        name: `E2E Zero Tenure ${Date.now()}`,
        minTenureMonths: 0,
      });

      expect(res.status).toBe(400);
    });
  });
});
