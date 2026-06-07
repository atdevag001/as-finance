import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const IV_LEN = 12; // 96-bit IV for GCM (NIST recommended)
const KEY_LEN = 32; // AES-256
const AUTH_TAG_LEN = 16;
const VERSION_PREFIX = 'v1:'; // Format version: AAD-bound payloads. Bump if envelope changes.

/**
 * AES-256-GCM PII encryption service.
 *
 * Format: "v1:" base64(iv) ":" base64(ciphertext) ":" base64(tag)
 *
 * Key sourced from ENCRYPTION_KEY env (base64-encoded 32 bytes).
 * Key MUST differ from JWT_SECRET (enforced by env validation).
 *
 * AAD binding: callers MUST pass a stable per-record context string (e.g.
 * `customer:${id}:aadhaar`) to encrypt()/decrypt(). The AAD is fed into the
 * GCM tag so a ciphertext for one (record, field) cannot be transplanted into
 * another row/column — decrypt() will throw on tag mismatch.
 *
 * Losing the key = permanent loss of all encrypted PII. Back it up securely.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly key: Buffer;

  constructor() {
    const keyB64 = process.env['ENCRYPTION_KEY'];
    const nodeEnv = process.env['NODE_ENV'];
    if (!keyB64) {
      // SAFE gating: anything except known-safe envs MUST have a real key.
      // Previously: only NODE_ENV === 'production' fell through. If NODE_ENV
      // was undefined/empty (e.g. forgotten in CI/staging), the insecure dev
      // key would silently activate.
      const isSafeEnv = nodeEnv === 'development' || nodeEnv === 'test';
      if (!isSafeEnv) {
        throw new Error(
          `ENCRYPTION_KEY env required when NODE_ENV=${nodeEnv ?? '<unset>'}. ` +
            `Insecure dev key only allowed for NODE_ENV in {development, test}.`,
        );
      }
      // Deterministic dev/test key — NEVER use in production
      this.key = Buffer.alloc(KEY_LEN, 0x42);
      this.logger.warn(
        'ENCRYPTION_KEY missing — using INSECURE dev key. Set ENCRYPTION_KEY for production.',
      );
      return;
    }

    const buf = Buffer.from(keyB64, 'base64');
    if (buf.length !== KEY_LEN) {
      throw new Error(
        `ENCRYPTION_KEY must decode to exactly ${KEY_LEN} bytes (base64). Got ${buf.length} bytes.`,
      );
    }
    if (keyB64 === process.env['JWT_SECRET']) {
      throw new Error('ENCRYPTION_KEY must differ from JWT_SECRET');
    }
    this.key = buf;
  }

  /**
   * Encrypt UTF-8 plaintext bound to a stable AAD context.
   * Returns "v1:iv:ciphertext:tag" (iv/ct/tag base64).
   * The AAD MUST uniquely identify the (record, field) — e.g. `customer:${id}:aadhaar` —
   * so a ciphertext cannot be transplanted to another row/column.
   */
  encrypt(plaintext: string, aad: string): string {
    if (typeof plaintext !== 'string') {
      throw new TypeError('encrypt() requires a string');
    }
    if (typeof aad !== 'string' || aad.length === 0) {
      throw new TypeError('encrypt() requires a non-empty AAD context string');
    }
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${VERSION_PREFIX}${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
  }

  /**
   * Decrypt "v1:iv:ciphertext:tag" payload using the same AAD passed at encrypt time.
   * Throws on tag mismatch (wrong key, tampered ciphertext, or AAD mismatch /
   * cross-record transplant attempt).
   */
  decrypt(ciphertext: string, aad: string): string {
    if (typeof ciphertext !== 'string') {
      throw new TypeError('decrypt() requires a string');
    }
    if (typeof aad !== 'string' || aad.length === 0) {
      throw new TypeError('decrypt() requires a non-empty AAD context string');
    }
    if (!ciphertext.startsWith(VERSION_PREFIX)) {
      throw new Error('Unsupported ciphertext version (expected v1:)');
    }
    const body = ciphertext.slice(VERSION_PREFIX.length);
    const parts = body.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format (expected v1:iv:ct:tag)');
    }
    const [ivB64, ctB64, tagB64] = parts;
    const iv = Buffer.from(ivB64!, 'base64');
    const ct = Buffer.from(ctB64!, 'base64');
    const tag = Buffer.from(tagB64!, 'base64');
    if (iv.length !== IV_LEN) throw new Error('Invalid IV length');
    if (tag.length !== AUTH_TAG_LEN) throw new Error('Invalid auth tag length');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}
