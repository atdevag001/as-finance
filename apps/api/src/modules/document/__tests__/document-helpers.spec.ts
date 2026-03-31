import { describe, it, expect } from 'vitest';
import {
  detectMimeType,
  isFileSizeValid,
  containsEmbeddedScripts,
} from '../document.service';

/**
 * Pure function unit tests for document helper functions.
 * No mocks needed — these are stateless, side-effect-free functions.
 *
 * Validates: Requirements 57.1, 57.2, 57.3, 57.4, 57.5
 */

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

describe('detectMimeType()', () => {
  it('detects JPEG from FF D8 FF magic bytes', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    expect(detectMimeType(buf)).toBe('image/jpeg');
  });

  it('detects JPEG with exact 3-byte signature', () => {
    const buf = Buffer.from([0xff, 0xd8, 0xff]);
    expect(detectMimeType(buf)).toBe('image/jpeg');
  });

  it('detects PNG from 89 50 4E 47 magic bytes', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectMimeType(buf)).toBe('image/png');
  });

  it('detects PDF from 25 50 44 46 (%PDF) magic bytes', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
    expect(detectMimeType(buf)).toBe('application/pdf');
  });

  it('returns null for unrecognized magic bytes', () => {
    const buf = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    expect(detectMimeType(buf)).toBeNull();
  });

  it('returns null for empty buffer', () => {
    expect(detectMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('returns null for plain text content', () => {
    const buf = Buffer.from('Hello, world!', 'utf-8');
    expect(detectMimeType(buf)).toBeNull();
  });

  it('returns null for truncated JPEG header (only 2 bytes)', () => {
    const buf = Buffer.from([0xff, 0xd8]);
    expect(detectMimeType(buf)).toBeNull();
  });

  it('returns null for truncated PNG header (only 3 bytes)', () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e]);
    expect(detectMimeType(buf)).toBeNull();
  });

  it('returns null for truncated PDF header (only 3 bytes)', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44]);
    expect(detectMimeType(buf)).toBeNull();
  });
});

describe('isFileSizeValid()', () => {
  it('accepts 1 byte (minimum valid size)', () => {
    expect(isFileSizeValid(1)).toBe(true);
  });

  it('accepts a typical file size (1 KB)', () => {
    expect(isFileSizeValid(1024)).toBe(true);
  });

  it('accepts a file at exactly 5 MB', () => {
    expect(isFileSizeValid(MAX_FILE_SIZE)).toBe(true);
  });

  it('accepts a file just under 5 MB', () => {
    expect(isFileSizeValid(MAX_FILE_SIZE - 1)).toBe(true);
  });

  it('rejects 0 bytes', () => {
    expect(isFileSizeValid(0)).toBe(false);
  });

  it('rejects negative size', () => {
    expect(isFileSizeValid(-1)).toBe(false);
  });

  it('rejects a large negative size', () => {
    expect(isFileSizeValid(-1_000_000)).toBe(false);
  });

  it('rejects file 1 byte over 5 MB', () => {
    expect(isFileSizeValid(MAX_FILE_SIZE + 1)).toBe(false);
  });

  it('rejects a very large file (100 MB)', () => {
    expect(isFileSizeValid(100 * 1024 * 1024)).toBe(false);
  });
});

describe('containsEmbeddedScripts()', () => {
  // --- Malicious content detection ---

  it('detects <script> tag', () => {
    const buf = Buffer.from('<html><script>alert("xss")</script></html>');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects <script> tag case-insensitively', () => {
    const buf = Buffer.from('<SCRIPT>alert(1)</SCRIPT>');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects <script with attributes', () => {
    const buf = Buffer.from('<script type="text/javascript">');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects javascript: URI', () => {
    const buf = Buffer.from('href="javascript:alert(1)"');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects JavaScript: URI case-insensitively', () => {
    const buf = Buffer.from('href="JavaScript:void(0)"');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects onclick= inline event handler', () => {
    const buf = Buffer.from('<div onclick="doEvil()">');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects onerror= inline event handler', () => {
    const buf = Buffer.from('<img onerror="alert(1)">');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects onload= inline event handler', () => {
    const buf = Buffer.from('<body onload="init()">');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects <% server-side template injection', () => {
    const buf = Buffer.from('<% Response.Write("injected") %>');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects <?php tag', () => {
    const buf = Buffer.from('<?php echo "injected"; ?>');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  it('detects <?PHP tag case-insensitively', () => {
    const buf = Buffer.from('<?PHP phpinfo(); ?>');
    expect(containsEmbeddedScripts(buf)).toBe(true);
  });

  // --- Clean file pass-through ---

  it('returns false for clean JPEG buffer', () => {
    // Real JPEG-like binary data (magic bytes + random binary)
    const buf = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    ]);
    expect(containsEmbeddedScripts(buf)).toBe(false);
  });

  it('returns false for clean PNG buffer', () => {
    const buf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
      0x0d, 0x49, 0x48, 0x44, 0x52,
    ]);
    expect(containsEmbeddedScripts(buf)).toBe(false);
  });

  it('returns false for clean PDF buffer', () => {
    const buf = Buffer.from([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xc3,
      0xa4, 0xc3, 0xbc, 0xc3, 0xb6,
    ]);
    expect(containsEmbeddedScripts(buf)).toBe(false);
  });

  it('returns false for empty buffer', () => {
    expect(containsEmbeddedScripts(Buffer.alloc(0))).toBe(false);
  });

  it('returns false for plain text without script patterns', () => {
    const buf = Buffer.from('This is a normal document with no scripts.');
    expect(containsEmbeddedScripts(buf)).toBe(false);
  });
});
