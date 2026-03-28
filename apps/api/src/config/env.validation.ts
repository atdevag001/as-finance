import { z } from 'zod';

/**
 * Environment variable schema — validated at startup.
 * Missing required variables cause immediate process exit with descriptive errors.
 */
export const envSchema = z.object({
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

  // Application
  NODE_ENV: z
    .enum(['development', 'test', 'staging', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
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
