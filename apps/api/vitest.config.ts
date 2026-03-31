import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['src/**/*.spec.ts', 'src/**/*.property.spec.ts'],
    exclude: [
      'src/**/*.integration.spec.ts',
      'test/e2e/**',
      'node_modules',
      'dist',
    ],
    pool: 'threads',
    testTimeout: 10_000,
    hookTimeout: 10_000,
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
      thresholds: {
        'src/modules/schedule/schedule.service.ts': {
          statements: 95,
          branches: 95,
        },
        'src/modules/collection/allocation-engine.ts': {
          statements: 95,
          branches: 95,
        },
        'src/modules/collection/collection.service.ts': {
          statements: 85,
          branches: 85,
        },
        'src/modules/reversal/reversal.service.ts': {
          statements: 90,
          branches: 90,
        },
        'src/common/guards/rbac.guard.ts': {
          statements: 90,
          branches: 90,
        },
      },
    },
  },
});
