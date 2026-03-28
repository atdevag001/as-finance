import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: '.',
    include: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/*.property.spec.ts',
      'test/**/*.spec.ts',
    ],
    exclude: ['src/**/*.integration.spec.ts', 'node_modules', 'dist'],
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
