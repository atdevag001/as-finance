import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const IV_LEN = 12; // 96-bit IV for GCM (NIST recommended)
const KEY_LEN = 32; // AES-256
const AUTH_TAG_LEN = 16;

/**
 * AES-256-GCM PII encryption service.
 *
 * Format: base64(iv) ":" base64(ciphertext) ":" base64(tag)
 *
 * Key sourced from ENCRYPTION_KEY env (base64-encoded 32 bytes).
 * Key MUST differ from JWT_SECRET (enforced by env validation).
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

  /** Encrypt UTF-8 plaintext. Returns "iv:ciphertext:tag" all base64. */
  encrypt(plaintext: string): string {
    if (typeof plaintext !== 'string') {
      throw new TypeError('encrypt() requires a string');
    }
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${ct.toString('base64')}:${tag.toString('base64')}`;
  }

  /** Decrypt "iv:ciphertext:tag" base64 triplet back to UTF-8 plaintext. */
  decrypt(ciphertext: string): string {
    if (typeof ciphertext !== 'string') {
      throw new TypeError('decrypt() requires a string');
    }
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format (expected iv:ct:tag)');
    }
    const [ivB64, ctB64, tagB64] = parts;
    const iv = Buffer.from(ivB64!, 'base64');
    const ct = Buffer.from(ctB64!, 'base64');
    const tag = Buffer.from(tagB64!, 'base64');
    if (iv.length !== IV_LEN) throw new Error('Invalid IV length');
    if (tag.length !== AUTH_TAG_LEN) throw new Error('Invalid auth tag length');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  }
}
