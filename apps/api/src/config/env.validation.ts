import { z } from 'zod';

/** Known-bad values that must NEVER appear in production env */
const LEAKED_JWT_SECRETS = new Set([
  'as_finance_production_secret_key_2024_secure',
]);

const LEAKED_S3_KEYS = new Set(['minioadmin']);

/**
 * Environment variable schema — validated at startup.
 * Missing required variables cause immediate process exit with descriptive errors.
 */
export const envSchema = z
  .object({
    // Database
    DATABASE_URL: z
      .string({ required_error: 'DATABASE_URL is required' })
      .url('DATABASE_URL must be a valid URL'),

    // JWT
    JWT_SECRET: z
      .string({ required_error: 'JWT_SECRET is required' })
      .min(16, 'JWT_SECRET must be at least 16 characters'),
    JWT_EXPIRY: z.string().default('15m'),
    REFRESH_TOKEN_EXPIRY: z.string().default('7d'),

    // PII encryption key (AES-256-GCM) — 32 bytes base64. Required in production.
    ENCRYPTION_KEY: z.string().optional(),

    // S3 / MinIO (optional in dev, required in production)
    S3_ENDPOINT: z.string().optional(),
    S3_ACCESS_KEY: z.string().optional(),
    S3_SECRET_KEY: z.string().optional(),
    S3_BUCKET: z.string().default('as-finance-docs'),
    S3_REGION: z.string().default('us-east-1'),

    // SMS (optional — failure never blocks finance ops)
    SMS_API_KEY: z.string().optional(),
    SMS_API_URL: z.string().optional(),
    SMS_SENDER_ID: z.string().default('ASFIN'),

    // Token rotation behavior — must NOT be disabled in production
    SKIP_TOKEN_ROTATION: z.string().optional(),

    // Application
    NODE_ENV: z
      .enum(['development', 'test', 'staging', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3001),

    // CORS allowlist (comma-separated origins). Optional — empty means no
    // cross-origin browsers are allowed (server-to-server / same-origin only).
    CORS_ORIGINS: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (LEAKED_JWT_SECRETS.has(env.JWT_SECRET)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_SECRET'],
        message:
          'JWT_SECRET matches a known-leaked value committed to git history. Rotate immediately.',
      });
    }

    if (env.NODE_ENV === 'production') {
      if (env.JWT_SECRET.length < 64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_SECRET'],
          message: 'JWT_SECRET must be at least 64 characters in production',
        });
      }
      if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ENDPOINT'],
          message:
            'S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY are required in production',
        });
      }
      if (env.S3_ACCESS_KEY && LEAKED_S3_KEYS.has(env.S3_ACCESS_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_ACCESS_KEY'],
          message:
            'S3_ACCESS_KEY uses a default value (minioadmin). Rotate before running in production.',
        });
      }
      if (env.S3_SECRET_KEY && LEAKED_S3_KEYS.has(env.S3_SECRET_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['S3_SECRET_KEY'],
          message:
            'S3_SECRET_KEY uses a default value (minioadmin). Rotate before running in production.',
        });
      }
      if (!env.ENCRYPTION_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message: 'ENCRYPTION_KEY is required in production',
        });
      } else if (env.ENCRYPTION_KEY === env.JWT_SECRET) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['ENCRYPTION_KEY'],
          message: 'ENCRYPTION_KEY must differ from JWT_SECRET',
        });
      } else {
        try {
          const buf = Buffer.from(env.ENCRYPTION_KEY, 'base64');
          if (buf.length !== 32) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['ENCRYPTION_KEY'],
              message: 'ENCRYPTION_KEY must decode to exactly 32 bytes (base64)',
            });
          }
        } catch {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['ENCRYPTION_KEY'],
            message: 'ENCRYPTION_KEY must be valid base64',
          });
        }
      }
      if (env.SKIP_TOKEN_ROTATION === 'true') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SKIP_TOKEN_ROTATION'],
          message: 'SKIP_TOKEN_ROTATION=true is not allowed in production',
        });
      }
    }
  });

export type EnvConfig = z.infer<typeof envSchema>;

/**
 * Validate environment variables at startup.
 * Exits the process with descriptive errors if validation fails.
 */
export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error(
      `\n❌ Environment validation failed:\n${errors}\n\nPlease check your .env file or environment variables.\n`,
    );
    process.exit(1);
  }

  return result.data;
}
