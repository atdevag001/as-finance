import { describe, it, expect } from 'vitest';
import { maskAadhaar, maskPan, maskMobile } from '../masking.js';

describe('maskAadhaar', () => {
  it('masks a 12-digit Aadhaar showing only last 4 digits', () => {
    expect(maskAadhaar('123456781234')).toBe('XXXX-XXXX-1234');
  });

  it('works with all zeros', () => {
    expect(maskAadhaar('000000000000')).toBe('XXXX-XXXX-0000');
  });

  it('works with all nines', () => {
    expect(maskAadhaar('999999999999')).toBe('XXXX-XXXX-9999');
  });
});

describe('maskPan', () => {
  it('masks a PAN showing only last 4 characters', () => {
    expect(maskPan('ABCDE1234F')).toBe('XXXXXX234F');
  });

  it('works with another valid PAN', () => {
    expect(maskPan('ZZZZZ9999Z')).toBe('XXXXXX999Z');
  });
});

describe('maskMobile', () => {
  it('masks a 10-digit mobile showing only last 4 digits', () => {
    expect(maskMobile('9876543210')).toBe('XXXXXX3210');
  });

  it('works with another number', () => {
    expect(maskMobile('6000000001')).toBe('XXXXXX0001');
  });
});
