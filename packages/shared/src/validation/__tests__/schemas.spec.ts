import { describe, it, expect } from 'vitest';
import {
  aadhaarSchema,
  panSchema,
  mobileSchema,
  pincodeSchema,
  paiseSchema,
  passwordSchema,
} from '../schemas.js';

describe('aadhaarSchema', () => {
  it('accepts valid 12-digit Aadhaar', () => {
    expect(aadhaarSchema.safeParse('123456789012').success).toBe(true);
  });

  it('rejects 11-digit string', () => {
    expect(aadhaarSchema.safeParse('12345678901').success).toBe(false);
  });

  it('rejects string with letters', () => {
    expect(aadhaarSchema.safeParse('12345678901a').success).toBe(false);
  });
});

describe('panSchema', () => {
  it('accepts valid PAN format', () => {
    expect(panSchema.safeParse('ABCDE1234F').success).toBe(true);
  });

  it('rejects lowercase letters', () => {
    expect(panSchema.safeParse('abcde1234f').success).toBe(false);
  });

  it('rejects wrong length', () => {
    expect(panSchema.safeParse('ABCDE123F').success).toBe(false);
  });
});

describe('mobileSchema', () => {
  it('accepts valid mobile starting with 9', () => {
    expect(mobileSchema.safeParse('9876543210').success).toBe(true);
  });

  it('accepts valid mobile starting with 6', () => {
    expect(mobileSchema.safeParse('6000000000').success).toBe(true);
  });

  it('rejects mobile starting with 5', () => {
    expect(mobileSchema.safeParse('5000000000').success).toBe(false);
  });

  it('rejects 9-digit number', () => {
    expect(mobileSchema.safeParse('987654321').success).toBe(false);
  });
});

describe('pincodeSchema', () => {
  it('accepts valid 6-digit pincode', () => {
    expect(pincodeSchema.safeParse('110001').success).toBe(true);
  });

  it('rejects 5-digit string', () => {
    expect(pincodeSchema.safeParse('11000').success).toBe(false);
  });
});

describe('paiseSchema', () => {
  it('accepts positive integer', () => {
    expect(paiseSchema.safeParse(100).success).toBe(true);
  });

  it('rejects zero', () => {
    expect(paiseSchema.safeParse(0).success).toBe(false);
  });

  it('rejects negative', () => {
    expect(paiseSchema.safeParse(-100).success).toBe(false);
  });

  it('rejects float', () => {
    expect(paiseSchema.safeParse(1.5).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts valid password', () => {
    expect(passwordSchema.safeParse('Abcdef1g').success).toBe(true);
  });

  it('rejects too short', () => {
    expect(passwordSchema.safeParse('Ab1').success).toBe(false);
  });

  it('rejects no uppercase', () => {
    expect(passwordSchema.safeParse('abcdefg1').success).toBe(false);
  });

  it('rejects no lowercase', () => {
    expect(passwordSchema.safeParse('ABCDEFG1').success).toBe(false);
  });

  it('rejects no digit', () => {
    expect(passwordSchema.safeParse('Abcdefgh').success).toBe(false);
  });
});
