import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    root: path.resolve(__dirname, '../..'),
    include: ['test/pact/**/*.pact.spec.ts'],
    pool: 'threads',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
