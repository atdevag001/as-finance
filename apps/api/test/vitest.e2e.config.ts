import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/e2e/**/*.e2e.spec.ts',
      'test/pbt/**/*.pbt.spec.ts',
      'test/negative.e2e.spec.ts',
      'test/concurrency.e2e.spec.ts',
      'test/security.e2e.spec.ts',
    ],
    globalSetup: ['test/setup/global-setup.ts'],
    setupFiles: ['test/setup/worker-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'threads',
    poolOptions: {
      threads: { minThreads: 1, maxThreads: 1 },
    },
    reporters: ['verbose'],
    bail: 0,
  },
});
