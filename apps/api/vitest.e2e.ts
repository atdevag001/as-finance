import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: [
      'test/e2e/**/*.spec.ts',
      'test/security.spec.ts',
      'test/concurrency.spec.ts',
      'test/negative.spec.ts',
      'test/contract/**/*.spec.ts',
      'test/rbac-matrix.spec.ts',
    ],
    exclude: ['node_modules', 'dist'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
    sequence: {
      concurrent: false,
    },
    globalSetup: ['test/setup/global-setup.ts'],
    reporters: ['verbose'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/*.property.spec.ts',
        'src/**/*.integration.spec.ts',
        'src/**/*.module.ts',
        'src/main.ts',
      ],
    },
  },
});
