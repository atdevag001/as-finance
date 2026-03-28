/**
 * Factory helper utilities for generating test entities.
 * Each factory returns a complete valid entity with sensible defaults,
 * accepting optional overrides for any field.
 */

import { randomUUID } from 'node:crypto';

export { randomUUID };

/**
 * Merges default values with optional overrides.
 * Overrides take precedence over defaults.
 */
export function buildEntity<T>(
  defaults: T,
  overrides?: Partial<T>,
): T {
  if (!overrides) return { ...defaults };
  return { ...defaults, ...overrides };
}

/** Generate a random integer in [min, max] range (paise-safe). */
export function randomPaise(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generate a random integer in [min, max] range. */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Generate a random 12-digit Aadhaar number string. */
export function randomAadhaar(): string {
  let result = '';
  for (let i = 0; i < 12; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
}

/** Generate a random PAN in format AAAAA9999A. */
export function randomPan(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let pan = '';
  for (let i = 0; i < 5; i++) pan += letters[Math.floor(Math.random() * 26)];
  for (let i = 0; i < 4; i++) pan += Math.floor(Math.random() * 10).toString();
  pan += letters[Math.floor(Math.random() * 26)];
  return pan;
}

/** Generate a random 10-digit Indian mobile number starting with 6-9. */
export function randomMobile(): string {
  const firstDigit = Math.floor(Math.random() * 4) + 6; // 6, 7, 8, or 9
  let rest = '';
  for (let i = 0; i < 9; i++) {
    rest += Math.floor(Math.random() * 10).toString();
  }
  return `${firstDigit}${rest}`;
}

/** Generate a random 6-digit pincode. */
export function randomPincode(): string {
  const first = Math.floor(Math.random() * 9) + 1; // 1-9
  let rest = '';
  for (let i = 0; i < 5; i++) {
    rest += Math.floor(Math.random() * 10).toString();
  }
  return `${first}${rest}`;
}
