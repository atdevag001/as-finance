import { describe, it, expect } from 'vitest';
import { envSchema } from '../../src/config/env.validation.js';

/**
 * Environment Variable Validation E2E Tests
 *
 * Tests the Zod-based startup validator directly with various inputs.
 * Verifies required fields, format constraints, minimum lengths,
 * default value application, and optional field handling.
 *
 * Validates: Design GAP 21
 */

/** Minimal valid environment for reuse across tests */
const VALID_ENV = {
  DATABASE_URL: 'postgresql://postgres:AsFinance2024!@localhost:5432/as_finance_lms',
  JWT_SECRET: 'a-very-secure-secret-key-here',
};

describe('Env Validation E2E', () => {
  describe('valid environment', () => {
    it('should pass validation with all required fields', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should pass validation with all fields provided', () => {
      const result = envSchema.safeParse({
        ...VALID_ENV,
        JWT_EXPIRY: '30m',
        REFRESH_TOKEN_EXPIRY: '14d',
        S3_ENDPOINT: 'http://localhost:9000',
        S3_ACCESS_KEY: 'minioadmin',
        S3_SECRET_KEY: 'minioadmin',
        S3_BUCKET: 'custom-bucket',
        S3_REGION: 'ap-south-1',
        SMS_API_KEY: 'test-key',
        SMS_API_URL: 'https://sms.example.com',
        SMS_SENDER_ID: 'CUSTOM',
        NODE_ENV: 'production',
        PORT: '8080',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_EXPIRY).toBe('30m');
        expect(result.data.PORT).toBe(8080);
        expect(result.data.NODE_ENV).toBe('production');
        expect(result.data.S3_BUCKET).toBe('custom-bucket');
      }
    });
  });

  describe('missing required fields', () => {
    it('should fail when DATABASE_URL is missing', () => {
      const result = envSchema.safeParse({
        JWT_SECRET: VALID_ENV.JWT_SECRET,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('DATABASE_URL');
      }
    });

    it('should fail when JWT_SECRET is missing', () => {
      const result = envSchema.safeParse({
        DATABASE_URL: VALID_ENV.DATABASE_URL,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('JWT_SECRET');
      }
    });

    it('should fail when both DATABASE_URL and JWT_SECRET are missing', () => {
      const result = envSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        const paths = result.error.issues.map((i) => i.path.join('.'));
        expect(paths).toContain('DATABASE_URL');
        expect(paths).toContain('JWT_SECRET');
      }
    });
  });

  describe('JWT_SECRET minimum length', () => {
    it('should fail when JWT_SECRET is shorter than 16 characters', () => {
      const result = envSchema.safeParse({
        ...VALID_ENV,
        JWT_SECRET: 'short',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const jwtIssue = result.error.issues.find((i) => i.path.includes('JWT_SECRET'));
        expect(jwtIssue).toBeDefined();
        expect(jwtIssue!.message).toContain('at least 16 characters');
      }
    });

    it('should fail when JWT_SECRET is exactly 15 characters', () => {
      const result = envSchema.safeParse({
        ...VALID_ENV,
        JWT_SECRET: 'a'.repeat(15),
      });

      expect(result.success).toBe(false);
    });

    it('should pass when JWT_SECRET is exactly 16 characters', () => {
      const result = envSchema.safeParse({
        ...VALID_ENV,
        JWT_SECRET: 'a'.repeat(16),
      });

      expect(result.success).toBe(true);
    });
  });

  describe('invalid DATABASE_URL format', () => {
    it('should fail when DATABASE_URL is not a valid URL', () => {
      const result = envSchema.safeParse({
        ...VALID_ENV,
        DATABASE_URL: 'not-a-url',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const dbIssue = result.error.issues.find((i) => i.path.includes('DATABASE_URL'));
        expect(dbIssue).toBeDefined();
      }
    });

    it('should fail when DATABASE_URL is an empty string', () => {
      const result = envSchema.safeParse({
        ...VALID_ENV,
        DATABASE_URL: '',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('default values', () => {
    it('should apply PORT default of 3001', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(3001);
      }
    });

    it('should apply JWT_EXPIRY default of 15m', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_EXPIRY).toBe('15m');
      }
    });

    it('should apply REFRESH_TOKEN_EXPIRY default of 7d', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.REFRESH_TOKEN_EXPIRY).toBe('7d');
      }
    });

    it('should apply NODE_ENV default of development', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe('development');
      }
    });

    it('should apply S3_BUCKET default of as-finance-docs', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.S3_BUCKET).toBe('as-finance-docs');
      }
    });

    it('should apply S3_REGION default of us-east-1', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.S3_REGION).toBe('us-east-1');
      }
    });

    it('should apply SMS_SENDER_ID default of ASFIN', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SMS_SENDER_ID).toBe('ASFIN');
      }
    });
  });

  describe('optional fields', () => {
    it('should pass when S3 optional fields are omitted', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.S3_ENDPOINT).toBeUndefined();
        expect(result.data.S3_ACCESS_KEY).toBeUndefined();
        expect(result.data.S3_SECRET_KEY).toBeUndefined();
      }
    });

    it('should pass when SMS optional fields are omitted', () => {
      const result = envSchema.safeParse(VALID_ENV);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.SMS_API_KEY).toBeUndefined();
        expect(result.data.SMS_API_URL).toBeUndefined();
      }
    });
  });

  describe('invalid NODE_ENV', () => {
    it('should fail when NODE_ENV is not in allowed enum', () => {
      const result = envSchema.safeParse({
        ...VALID_ENV,
        NODE_ENV: 'invalid',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        const nodeEnvIssue = result.error.issues.find((i) => i.path.includes('NODE_ENV'));
        expect(nodeEnvIssue).toBeDefined();
      }
    });

    it('should accept all valid NODE_ENV values', () => {
      for (const env of ['development', 'test', 'staging', 'production']) {
        const result = envSchema.safeParse({ ...VALID_ENV, NODE_ENV: env });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('PORT coercion', () => {
    it('should coerce PORT string to number', () => {
      const result = envSchema.safeParse({ ...VALID_ENV, PORT: '8080' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PORT).toBe(8080);
        expect(typeof result.data.PORT).toBe('number');
      }
    });

    it('should reject non-positive PORT', () => {
      const result = envSchema.safeParse({ ...VALID_ENV, PORT: '0' });

      expect(result.success).toBe(false);
    });

    it('should reject negative PORT', () => {
      const result = envSchema.safeParse({ ...VALID_ENV, PORT: '-1' });

      expect(result.success).toBe(false);
    });
  });
});
