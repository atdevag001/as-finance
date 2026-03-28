import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['src/**/*.integration.spec.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.test.ts',
        'src/**/*.property.spec.ts',
        'src/**/*.integration.spec.ts',
        'src/main.ts',
      ],
    },
  },
});
