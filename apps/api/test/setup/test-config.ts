/**
 * Test environment configuration.
 * Loads from environment variables with sensible defaults for local development.
 */

export interface TestConfig {
  database: {
    url: string;
    maxConnections: number;
  };
  api: {
    baseUrl: string;
    healthEndpoint: string;
    timeoutMs: number;
  };
  frontend: {
    baseUrl: string;
  };
  minio: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
  };
  pbt: {
    defaultNumRuns: number;
    financeNumRuns: number;
  };
}

export function loadTestConfig(): TestConfig {
  return {
    database: {
      url:
        process.env.TEST_DATABASE_URL ??
        'postgresql://postgres:AsFinance2024!@localhost:5432/as_finance_lms',
      maxConnections: parseInt(process.env.TEST_DB_MAX_CONNECTIONS ?? '5', 10),
    },
    api: {
      baseUrl: process.env.TEST_API_BASE_URL ?? 'http://localhost:3001',
      healthEndpoint: process.env.TEST_API_HEALTH_ENDPOINT ?? '/health/ready',
      timeoutMs: parseInt(process.env.TEST_API_TIMEOUT_MS ?? '30000', 10),
    },
    frontend: {
      baseUrl: process.env.TEST_FRONTEND_BASE_URL ?? 'http://localhost:3000',
    },
    minio: {
      endpoint: process.env.TEST_MINIO_ENDPOINT ?? 'localhost',
      port: parseInt(process.env.TEST_MINIO_PORT ?? '9000', 10),
      accessKey: process.env.TEST_MINIO_ACCESS_KEY ?? 'minioadmin',
      secretKey: process.env.TEST_MINIO_SECRET_KEY ?? 'minioadmin',
    },
    pbt: {
      defaultNumRuns: parseInt(process.env.TEST_PBT_DEFAULT_RUNS ?? '100', 10),
      financeNumRuns: parseInt(process.env.TEST_PBT_FINANCE_RUNS ?? '1000', 10),
    },
  };
}

/** Singleton config instance */
export const testConfig: TestConfig = loadTestConfig();

/** Convenience exports for PBT run counts */
export const PBT_DEFAULT_RUNS = testConfig.pbt.defaultNumRuns;
export const PBT_FINANCE_RUNS = testConfig.pbt.financeNumRuns;
