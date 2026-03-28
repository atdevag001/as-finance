import { describe, it, expect, vi, afterEach } from 'vitest';
import { envSchema, validateEnv } from '../env.validation.js';

describe('envSchema', () => {
  it('accepts valid complete environment', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'a-very-secure-secret-key-here',
      PORT: '3001',
      NODE_ENV: 'development',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3001);
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  it('rejects missing DATABASE_URL', () => {
    const result = envSchema.safeParse({
      JWT_SECRET: 'a-very-secure-secret-key-here',
    });

    expect(result.success).toBe(false);
  });

  it('rejects missing JWT_SECRET', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    });

    expect(result.success).toBe(false);
  });

  it('rejects JWT_SECRET shorter than 16 characters', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'short',
    });

    expect(result.success).toBe(false);
  });

  it('rejects invalid DATABASE_URL', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'not-a-url',
      JWT_SECRET: 'a-very-secure-secret-key-here',
    });

    expect(result.success).toBe(false);
  });

  it('applies defaults for optional fields', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'a-very-secure-secret-key-here',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3001);
      expect(result.data.NODE_ENV).toBe('development');
      expect(result.data.JWT_EXPIRY).toBe('15m');
      expect(result.data.REFRESH_TOKEN_EXPIRY).toBe('7d');
      expect(result.data.S3_BUCKET).toBe('as-finance-docs');
      expect(result.data.S3_REGION).toBe('us-east-1');
      expect(result.data.SMS_SENDER_ID).toBe('ASFIN');
    }
  });

  it('rejects invalid NODE_ENV', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'a-very-secure-secret-key-here',
      NODE_ENV: 'invalid',
    });

    expect(result.success).toBe(false);
  });

  it('coerces PORT string to number', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
      JWT_SECRET: 'a-very-secure-secret-key-here',
      PORT: '8080',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
    }
  });
});

describe('validateEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exits process with code 1 on invalid env', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const originalEnv = { ...process.env };
    delete process.env['DATABASE_URL'];
    delete process.env['JWT_SECRET'];

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);

    // Restore
    Object.assign(process.env, originalEnv);
  });
});
