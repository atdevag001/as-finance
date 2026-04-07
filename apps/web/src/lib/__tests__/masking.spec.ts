import { describe, it, expect } from 'vitest';
import { maskAadhaar, maskPan, maskMobile } from '../masking';

/**
 * PII Masking Unit Tests
 *
 * Tests the masking functions for:
 * - Aadhaar (12 digits) -> XXXX-XXXX-{last4}
 * - PAN (10 chars) -> XXXXXX{last4}
 * - Mobile (10 digits) -> XXXXXX{last4}
 *
 * **Validates: Requirements 6.2, 6.3, 25.1, 25.2, 25.3**
 */

describe('maskAadhaar', () => {
  describe('basic masking', () => {
    it('masks standard 12-digit Aadhaar', () => {
      expect(maskAadhaar('123456789012')).toBe('XXXX-XXXX-9012');
    });

    it('shows only last 4 digits', () => {
      expect(maskAadhaar('111122223333')).toBe('XXXX-XXXX-3333');
    });

    it('masks all zeros', () => {
      expect(maskAadhaar('000000000000')).toBe('XXXX-XXXX-0000');
    });

    it('masks all nines', () => {
      expect(maskAadhaar('999999999999')).toBe('XXXX-XXXX-9999');
    });
  });

  describe('output format', () => {
    it('output has format XXXX-XXXX-NNNN', () => {
      const result = maskAadhaar('123456789012');
      expect(result).toMatch(/^XXXX-XXXX-\d{4}$/);
    });

    it('output length is always 14 characters', () => {
      expect(maskAadhaar('123456789012').length).toBe(14);
    });

    it('last 4 chars of output match last 4 chars of input', () => {
      const input = '123456785678';
      const result = maskAadhaar(input);
      expect(result.slice(-4)).toBe(input.slice(-4));
    });
  });

  describe('various inputs', () => {
    it('handles sequential digits', () => {
      expect(maskAadhaar('123456789012')).toBe('XXXX-XXXX-9012');
    });

    it('handles repeated pattern', () => {
      expect(maskAadhaar('121212121212')).toBe('XXXX-XXXX-1212');
    });

    it('handles alternating pattern', () => {
      expect(maskAadhaar('101010101010')).toBe('XXXX-XXXX-1010');
    });
  });
});

describe('maskPan', () => {
  describe('basic masking', () => {
    it('masks standard PAN', () => {
      expect(maskPan('ABCDE1234F')).toBe('XXXXXX234F');
    });

    it('shows only last 4 characters', () => {
      expect(maskPan('XYZAB9876C')).toBe('XXXXXX876C');
    });
  });

  describe('output format', () => {
    it('output has format XXXXXX followed by 4 chars', () => {
      const result = maskPan('ABCDE1234F');
      expect(result).toMatch(/^XXXXXX.{4}$/);
    });

    it('output length is always 10 characters', () => {
      expect(maskPan('ABCDE1234F').length).toBe(10);
    });

    it('last 4 chars of output match last 4 chars of input', () => {
      const input = 'ABCDE1234F';
      const result = maskPan(input);
      expect(result.slice(-4)).toBe(input.slice(-4));
    });
  });

  describe('various inputs', () => {
    it('handles different ending letters', () => {
      expect(maskPan('ABCDE1234A')).toBe('XXXXXX234A');
      expect(maskPan('ZZZZZ9999Z')).toBe('XXXXXX999Z');
    });

    it('handles all numeric ending', () => {
      // Though invalid PAN, function should still work
      expect(maskPan('ABCDE12345')).toBe('XXXXXX2345');
    });
  });
});

describe('maskMobile', () => {
  describe('basic masking', () => {
    it('masks standard Indian mobile', () => {
      expect(maskMobile('9876543210')).toBe('XXXXXX3210');
    });

    it('shows only last 4 digits', () => {
      expect(maskMobile('8765432109')).toBe('XXXXXX2109');
    });
  });

  describe('output format', () => {
    it('output has format XXXXXX followed by 4 digits', () => {
      const result = maskMobile('9876543210');
      expect(result).toMatch(/^XXXXXX\d{4}$/);
    });

    it('output length is always 10 characters', () => {
      expect(maskMobile('9876543210').length).toBe(10);
    });

    it('last 4 chars of output match last 4 chars of input', () => {
      const input = '9876543210';
      const result = maskMobile(input);
      expect(result.slice(-4)).toBe(input.slice(-4));
    });
  });

  describe('various inputs', () => {
    it('handles number starting with 6', () => {
      expect(maskMobile('6000000001')).toBe('XXXXXX0001');
    });

    it('handles number starting with 7', () => {
      expect(maskMobile('7123456789')).toBe('XXXXXX6789');
    });

    it('handles number starting with 8', () => {
      expect(maskMobile('8234567890')).toBe('XXXXXX7890');
    });

    it('handles number starting with 9', () => {
      expect(maskMobile('9345678901')).toBe('XXXXXX8901');
    });

    it('handles all same digits', () => {
      expect(maskMobile('1111111111')).toBe('XXXXXX1111');
    });
  });
});

describe('masking consistency', () => {
  it('Aadhaar masking is deterministic', () => {
    const input = '123456789012';
    const result1 = maskAadhaar(input);
    const result2 = maskAadhaar(input);
    expect(result1).toBe(result2);
  });

  it('PAN masking is deterministic', () => {
    const input = 'ABCDE1234F';
    const result1 = maskPan(input);
    const result2 = maskPan(input);
    expect(result1).toBe(result2);
  });

  it('Mobile masking is deterministic', () => {
    const input = '9876543210';
    const result1 = maskMobile(input);
    const result2 = maskMobile(input);
    expect(result1).toBe(result2);
  });
});
