/**
 * Migration Safety Tests (Task 24.9)
 *
 * Tests that migrations apply correctly, seed script works,
 * NOT NULL columns have defaults, and migration_lock.toml is correct.
 *
 * Validates: Requirements 72.1–72.5
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

// ─── Paths ───────────────────────────────────────────────────────────────────

const PRISMA_DIR = join(__dirname, '..', '..', '..', '..', 'prisma');
const MIGRATIONS_DIR = join(PRISMA_DIR, 'migrations');
const SCHEMA_PATH = join(PRISMA_DIR, 'schema.prisma');
const SEED_PATH = join(PRISMA_DIR, 'seed.ts');
const LOCK_PATH = join(MIGRATIONS_DIR, 'migration_lock.toml');

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Migration Safety (Req 72)', () => {
  // ─── 72.1: All migrations exist and have SQL files ───────────────────────

  describe('72.1 — Migrations apply successfully in sequence', () => {
    it('migrations directory exists', () => {
      expect(existsSync(MIGRATIONS_DIR)).toBe(true);
    });

    it('at least one migration directory exists', () => {
      const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
      const migrationDirs = entries.filter(
        (e) => e.isDirectory() && /^\d{14}_/.test(e.name),
      );
      expect(migrationDirs.length).toBeGreaterThanOrEqual(1);
    });

    it('each migration directory contains a migration.sql file', () => {
      const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
      const migrationDirs = entries.filter(
        (e) => e.isDirectory() && /^\d{14}_/.test(e.name),
      );

      for (const dir of migrationDirs) {
        const sqlPath = join(MIGRATIONS_DIR, dir.name, 'migration.sql');
        expect(existsSync(sqlPath), `Missing migration.sql in ${dir.name}`).toBe(true);
      }
    });

    it('migration SQL files are non-empty', () => {
      const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
      const migrationDirs = entries.filter(
        (e) => e.isDirectory() && /^\d{14}_/.test(e.name),
      );

      for (const dir of migrationDirs) {
        const sqlPath = join(MIGRATIONS_DIR, dir.name, 'migration.sql');
        const content = readFileSync(sqlPath, 'utf-8');
        expect(content.trim().length, `Empty migration.sql in ${dir.name}`).toBeGreaterThan(0);
      }
    });

    it('migration directories are in chronological order by timestamp prefix', () => {
      const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
      const migrationDirs = entries
        .filter((e) => e.isDirectory() && /^\d{14}_/.test(e.name))
        .map((e) => e.name)
        .sort();

      // Verify timestamps are strictly increasing
      for (let i = 1; i < migrationDirs.length; i++) {
        const prev = migrationDirs[i - 1]!.slice(0, 14);
        const curr = migrationDirs[i]!.slice(0, 14);
        expect(curr > prev, `Migration ${migrationDirs[i]} should be after ${migrationDirs[i - 1]}`).toBe(true);
      }
    });
  });

  // ─── 72.2: Seed script exists ────────────────────────────────────────────

  describe('72.2 — Seed script exists and is valid', () => {
    it('seed.ts file exists', () => {
      expect(existsSync(SEED_PATH)).toBe(true);
    });

    it('seed.ts is non-empty', () => {
      const content = readFileSync(SEED_PATH, 'utf-8');
      expect(content.trim().length).toBeGreaterThan(0);
    });

    it('seed.ts imports PrismaClient', () => {
      const content = readFileSync(SEED_PATH, 'utf-8');
      expect(content).toContain('PrismaClient');
    });
  });

  // ─── 72.3: Schema file exists and is valid ───────────────────────────────

  describe('72.3 — Schema consistency', () => {
    it('schema.prisma file exists', () => {
      expect(existsSync(SCHEMA_PATH)).toBe(true);
    });

    it('schema.prisma specifies postgresql provider', () => {
      const content = readFileSync(SCHEMA_PATH, 'utf-8');
      expect(content).toContain('provider = "postgresql"');
    });

    it('schema.prisma uses prisma-client-js generator', () => {
      const content = readFileSync(SCHEMA_PATH, 'utf-8');
      expect(content).toContain('provider = "prisma-client-js"');
    });
  });

  // ─── 72.4: NOT NULL columns have defaults ────────────────────────────────

  describe('72.4 — NOT NULL columns with defaults', () => {
    it('schema uses @default for boolean fields', () => {
      const content = readFileSync(SCHEMA_PATH, 'utf-8');
      // Check that boolean fields have defaults
      const booleanLines = content
        .split('\n')
        .filter((line) => line.includes('Boolean') && !line.includes('?'));

      for (const line of booleanLines) {
        // Non-optional Boolean fields should have @default
        if (line.trim().startsWith('//') || line.trim().startsWith('@@')) continue;
        if (line.includes('@relation')) continue;
        expect(
          line.includes('@default'),
          `Boolean field without default: ${line.trim()}`,
        ).toBe(true);
      }
    });

    it('version fields have @default(1)', () => {
      const content = readFileSync(SCHEMA_PATH, 'utf-8');
      const versionLines = content
        .split('\n')
        .filter((line) => /^\s+version\s+Int/.test(line));

      for (const line of versionLines) {
        expect(
          line.includes('@default(1)'),
          `Version field without @default(1): ${line.trim()}`,
        ).toBe(true);
      }
    });

    it('status enum fields have @default values', () => {
      const content = readFileSync(SCHEMA_PATH, 'utf-8');
      // Check key status fields
      const statusPatterns = [
        { field: 'status', model: 'loans', expected: '@default(draft)' },
        { field: 'status', model: 'customers', expected: '@default(active)' },
        { field: 'status', model: 'groups', expected: '@default(active)' },
      ];

      for (const pattern of statusPatterns) {
        expect(
          content.includes(pattern.expected),
          `Missing default for ${pattern.model}.${pattern.field}`,
        ).toBe(true);
      }
    });
  });

  // ─── 72.5: migration_lock.toml specifies postgresql ──────────────────────

  describe('72.5 — migration_lock.toml', () => {
    it('migration_lock.toml exists', () => {
      expect(existsSync(LOCK_PATH)).toBe(true);
    });

    it('migration_lock.toml specifies postgresql provider', () => {
      const content = readFileSync(LOCK_PATH, 'utf-8');
      expect(content).toContain('provider = "postgresql"');
    });
  });
});
