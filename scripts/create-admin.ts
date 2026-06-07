#!/usr/bin/env tsx
/**
 * AS-Finance — First super_admin creation CLI.
 *
 * Usage:
 *   cd apps/api && pnpm create-admin
 *
 * Prompts for username / full name / mobile / email / password from stdin so
 * the password never appears in shell history. Validates against the same
 * policy CreateUserDto enforces in the API (≥8 chars, upper, lower, digit;
 * username [A-Za-z0-9_.-]). Bcrypts at cost 12 (matching auth.service).
 *
 * Refuses to run if any active super_admin already exists, unless --force
 * is passed AND the operator confirms.
 *
 * This is the **only** sanctioned path to bootstrap a super_admin in a
 * production DB. The Prisma seed is hard-gated against NODE_ENV=production.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as readline from 'readline';
import { randomUUID } from 'crypto';

const BCRYPT_COST = process.env['BCRYPT_COST']
  ? parseInt(process.env['BCRYPT_COST'], 10)
  : 12;

const FORCE = process.argv.includes('--force');

const USERNAME_RE = /^[A-Za-z0-9_.\-]+$/;

interface PromptOptions {
  hidden?: boolean;
  validator?: (input: string) => string | null; // returns error message or null
}

function prompt(
  rl: readline.Interface,
  question: string,
  opts: PromptOptions = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!opts.hidden) {
      rl.question(question, (answer) => {
        const trimmed = answer.trim();
        if (opts.validator) {
          const err = opts.validator(trimmed);
          if (err) {
            console.error(`  ✗ ${err}`);
            resolve(prompt(rl, question, opts));
            return;
          }
        }
        resolve(trimmed);
      });
    } else {
      // Hidden input (password) — disable echo at the tty layer
      const stdin = process.stdin as NodeJS.ReadStream & { setRawMode?: (mode: boolean) => void };
      process.stdout.write(question);
      let buf = '';
      const onData = (data: Buffer): void => {
        const ch = data.toString('utf8');
        if (ch === '\r' || ch === '\n' || ch === '') {
          stdin.removeListener('data', onData);
          if (stdin.setRawMode) stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write('\n');
          if (opts.validator) {
            const err = opts.validator(buf);
            if (err) {
              console.error(`  ✗ ${err}`);
              resolve(prompt(rl, question, opts));
              return;
            }
          }
          resolve(buf);
        } else if (ch === '') {
          // Ctrl+C
          process.exit(130);
        } else if (ch === '' || ch === '\b') {
          // Backspace
          if (buf.length > 0) buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      };
      stdin.resume();
      if (stdin.setRawMode) stdin.setRawMode(true);
      stdin.on('data', onData);
      stdin.on('error', reject);
    }
  });
}

function validateUsername(s: string): string | null {
  if (!s) return 'Username is required';
  if (s.length < 3) return 'Username must be at least 3 characters';
  if (s.length > 50) return 'Username must be ≤ 50 characters';
  if (!USERNAME_RE.test(s))
    return 'Username may contain only letters, digits, dot, underscore, hyphen';
  return null;
}

function validatePassword(s: string): string | null {
  if (s.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(s)) return 'Password must contain at least one uppercase letter';
  if (!/[a-z]/.test(s)) return 'Password must contain at least one lowercase letter';
  if (!/\d/.test(s)) return 'Password must contain at least one digit';
  return null;
}

function validateMobile(s: string): string | null {
  if (!s) return 'Mobile is required';
  if (!/^[6-9]\d{9}$/.test(s))
    return 'Mobile must be a 10-digit Indian number starting with 6, 7, 8, or 9';
  return null;
}

function validateFullName(s: string): string | null {
  if (!s) return 'Full name is required';
  if (s.length > 200) return 'Full name must be ≤ 200 characters';
  return null;
}

function validateEmail(s: string): string | null {
  if (!s) return null; // optional
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return 'Invalid email format';
  return null;
}

async function main(): Promise<void> {
  console.log('\n=== AS-Finance — First super_admin creation ===\n');

  const prisma = new PrismaClient();

  try {
    // Refuse if an active super_admin already exists
    const existing = await prisma.users.findFirst({
      where: { role: 'super_admin', is_active: true },
      select: { id: true, username: true },
    });

    if (existing && !FORCE) {
      console.error(
        `\n✗ An active super_admin already exists (username: ${existing.username}).\n` +
          `  This CLI refuses to overwrite. Run with --force to add another super_admin\n` +
          `  (you'll be prompted to confirm).\n`,
      );
      process.exit(1);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });

    if (existing && FORCE) {
      const confirm = await prompt(
        rl,
        `\n⚠  An active super_admin already exists (${existing.username}).\n   Type "yes" to create another: `,
      );
      if (confirm.toLowerCase() !== 'yes') {
        console.log('\nAborted.');
        process.exit(0);
      }
    }

    const username = await prompt(rl, 'Username: ', { validator: validateUsername });
    const fullName = await prompt(rl, 'Full name: ', { validator: validateFullName });
    const mobile = await prompt(rl, 'Mobile (10 digits, starts 6/7/8/9): ', {
      validator: validateMobile,
    });
    const email = await prompt(rl, 'Email (optional, press Enter to skip): ', {
      validator: validateEmail,
    });

    let password = '';
    while (true) {
      password = await prompt(rl, 'Password (8+ chars, upper, lower, digit): ', {
        hidden: true,
        validator: validatePassword,
      });
      const confirm = await prompt(rl, 'Confirm password: ', { hidden: true });
      if (confirm === password) break;
      console.error('  ✗ Passwords do not match. Try again.');
    }

    rl.close();

    // Hash + insert (and a password_history row so the audit's "no reuse" check
    // sees a baseline)
    process.stdout.write('\nHashing password (cost ' + BCRYPT_COST + ')...');
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    process.stdout.write(' done.\n');

    process.stdout.write('Inserting super_admin...');
    const userId = randomUUID();
    await prisma.$transaction(async (tx) => {
      await tx.users.create({
        data: {
          id: userId,
          username,
          full_name: fullName,
          mobile,
          email: email || null,
          password_hash: passwordHash,
          role: 'super_admin' as never,
          is_active: true,
          token_version: 1,
        },
      });
      await tx.password_history.create({
        data: {
          user_id: userId,
          password_hash: passwordHash,
        },
      });
      await tx.audit_logs.create({
        data: {
          action_type: 'user_created' as never,
          actor_id: userId, // self — there's no other user to attribute to
          actor_role: 'super_admin',
          target_entity: 'user',
          target_id: userId,
          after_state: {
            username,
            full_name: fullName,
            role: 'super_admin',
            via: 'create-admin CLI',
          },
        },
      });
    });
    process.stdout.write(' done.\n');

    console.log('\n✅ super_admin created successfully.\n');
    console.log(`   id:       ${userId}`);
    console.log(`   username: ${username}`);
    console.log(`   role:     super_admin`);
    console.log('\nVerify by logging in:');
    console.log(`   curl -X POST http://localhost:3001/auth/login \\`);
    console.log(`     -H 'Content-Type: application/json' \\`);
    console.log(`     -d '{"username":"${username}","password":"<the password>"}'`);
    console.log('');
  } catch (err) {
    console.error('\n✗ create-admin failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
