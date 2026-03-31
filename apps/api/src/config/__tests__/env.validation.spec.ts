import { describe, it, expect, vi, afterEach } from 'vitest';
import { envSchema, validateEnv } from '../env.validation.js';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Minimal valid env for reuse across tests */
const validEnv = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a-very-secure-secret-key-here',
};

/* ------------------------------------------------------------------ */
/*  envSchema — Zod schema-level tests                                 */
/* ------------------------------------------------------------------ */

describe('envSchema', () => {
  /* ---------- Required fields ---------- */

  it('accepts valid complete environment', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      PORT: '3001',
      NODE_ENV: 'development',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3001);
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  /** Validates: Requirement 70.1 */
  it('rejects missing DATABASE_URL', () => {
    const result = envSchema.safeParse({
      JWT_SECRET: validEnv.JWT_SECRET,
    });
    expect(result.success).toBe(false);
  });

  /** Validates: Requirement 70.2 */
  it('rejects invalid DATABASE_URL (non-URL format)', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: 'not-a-url',
      JWT_SECRET: validEnv.JWT_SECRET,
    });
    expect(result.success).toBe(false);
  });

  /** Validates: Requirement 70.3 */
  it('rejects missing JWT_SECRET', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: validEnv.DATABASE_URL,
    });
    expect(result.success).toBe(false);
  });

  /** Validates: Requirement 70.4 */
  it('rejects JWT_SECRET shorter than 16 characters', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: validEnv.DATABASE_URL,
      JWT_SECRET: 'short',
    });
    expect(result.success).toBe(false);
  });

  it('accepts JWT_SECRET of exactly 16 characters', () => {
    const result = envSchema.safeParse({
      DATABASE_URL: validEnv.DATABASE_URL,
      JWT_SECRET: '1234567890123456',
    });
    expect(result.success).toBe(true);
  });

  /* ---------- Optional fields (Requirement 70.5) ---------- */

  it('does not fail when S3_ENDPOINT is absent', () => {
    const result = envSchema.safeParse({ ...validEnv });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_ENDPOINT).toBeUndefined();
    }
  });

  it('does not fail when SMS_API_KEY is absent', () => {
    const result = envSchema.safeParse({ ...validEnv });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SMS_API_KEY).toBeUndefined();
    }
  });

  it('accepts S3_ENDPOINT when provided', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      S3_ENDPOINT: 'http://localhost:9000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_ENDPOINT).toBe('http://localhost:9000');
    }
  });

  it('accepts SMS_API_KEY when provided', () => {
    const result = envSchema.safeParse({
      ...validEnv,
      SMS_API_KEY: 'some-api-key',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.SMS_API_KEY).toBe('some-api-key');
    }
  });

  /* ---------- Default values (Requirement 70.6) ---------- */

  it('applies default JWT_EXPIRY of 15m', () => {
    const result = envSchema.safeParse({ ...validEnv });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_EXPIRY).toBe('15m');
    }
  });

  it('applies default REFRESH_TOKEN_EXPIRY of 7d', () => {
    const result = envSchema.safeParse({ ...validEnv });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.REFRESH_TOKEN_EXPIRY).toBe('7d');
    }
  });

  it('applies default S3_BUCKET of as-finance-docs', () => {
    const result = envSchema.safeParse({ ...validEnv });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.S3_BUCKET).toBe('as-finance-docs');
    }
  });

  it('applies default NODE_ENV of development', () => {
    const result = envSchema.safeParse({ ...validEnv });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.NODE_ENV).toBe('development');
    }
  });

  it('applies default PORT of 3001', () => {
    const result = envSchema.safeParse({ ...validEnv });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(3001);
    }
  });

  /* ---------- NODE_ENV validation (Requirement 70.7) ---------- */

  it.each(['development', 'test', 'staging', 'production'] as const)(
    'accepts NODE_ENV=%s',
    (env) => {
      const result = envSchema.safeParse({ ...validEnv, NODE_ENV: env });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.NODE_ENV).toBe(env);
      }
    },
  );

  it('rejects invalid NODE_ENV value', () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string NODE_ENV', () => {
    const result = envSchema.safeParse({ ...validEnv, NODE_ENV: '' });
    expect(result.success).toBe(false);
  });

  /* ---------- PORT coercion (Requirement 70.8) ---------- */

  it('coerces PORT string to positive integer', () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: '8080' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.PORT).toBe(8080);
    }
  });

  it('rejects PORT of 0 (not positive)', () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: '0' });
    expect(result.success).toBe(false);
  });

  it('rejects negative PORT', () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: '-1' });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer PORT', () => {
    const result = envSchema.safeParse({ ...validEnv, PORT: '3.14' });
    expect(result.success).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  validateEnv — process-level tests                                  */
/* ------------------------------------------------------------------ */

describe('validateEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Validates: Requirement 70.1 — missing DATABASE_URL causes process exit */
  it('exits process with code 1 when DATABASE_URL is missing', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const saved = { ...process.env };
    // Clear all required vars to ensure only DATABASE_URL triggers
    delete process.env['DATABASE_URL'];
    process.env['JWT_SECRET'] = validEnv.JWT_SECRET;

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('DATABASE_URL'),
    );

    // Restore
    Object.assign(process.env, saved);
  });

  /** Validates: Requirement 70.2 — invalid DATABASE_URL causes process exit */
  it('exits process with code 1 when DATABASE_URL is invalid', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const saved = { ...process.env };
    process.env['DATABASE_URL'] = 'not-a-url';
    process.env['JWT_SECRET'] = validEnv.JWT_SECRET;

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('DATABASE_URL'),
    );

    Object.assign(process.env, saved);
  });

  /** Validates: Requirement 70.3 — missing JWT_SECRET causes process exit */
  it('exits process with code 1 when JWT_SECRET is missing', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const saved = { ...process.env };
    process.env['DATABASE_URL'] = validEnv.DATABASE_URL;
    delete process.env['JWT_SECRET'];

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('JWT_SECRET'),
    );

    Object.assign(process.env, saved);
  });

  /** Validates: Requirement 70.4 — short JWT_SECRET causes process exit */
  it('exits process with code 1 when JWT_SECRET is too short', () => {
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const saved = { ...process.env };
    process.env['DATABASE_URL'] = validEnv.DATABASE_URL;
    process.env['JWT_SECRET'] = 'short';

    validateEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('JWT_SECRET'),
    );

    Object.assign(process.env, saved);
  });
});
