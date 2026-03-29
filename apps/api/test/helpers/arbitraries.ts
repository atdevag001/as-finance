import * as fc from 'fast-check';

// ─── Domain-Specific Generators ─────────────────────────────────────────────

/** Valid 12-digit Aadhaar number (does not start with 0 or 1) */
export const arbAadhaarNumber: fc.Arbitrary<string> = fc
  .stringOf(fc.constantFrom(...'0123456789'.split('')), {
    minLength: 12,
    maxLength: 12,
  })
  .filter((s) => s[0] !== '0' && s[0] !== '1');

/** Valid PAN number: AAAAA9999A pattern */
export const arbPanNumber: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringOf(
      fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
      { minLength: 5, maxLength: 5 },
    ),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
      minLength: 4,
      maxLength: 4,
    }),
    fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')),
  )
  .map(([letters, digits, last]) => `${letters}${digits}${last}`);

/** Valid Indian mobile number: 10 digits starting with 6-9 */
export const arbMobileNumber: fc.Arbitrary<string> = fc
  .tuple(
    fc.constantFrom('6', '7', '8', '9'),
    fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
      minLength: 9,
      maxLength: 9,
    }),
  )
  .map(([first, rest]) => `${first}${rest}`);

/** Valid paise amount: positive integer within typical loan ranges (1 INR to 1,00,000 INR) */
export const arbPaiseAmount: fc.Arbitrary<number> = fc.integer({
  min: 100,
  max: 100_000_00,
});

/** Valid principal amount in paise within product bounds */
export const arbPrincipalPaise = (
  min: number,
  max: number,
): fc.Arbitrary<number> => fc.integer({ min, max });

/** Valid annual rate in basis points (100 = 1%, typical range 600-3600 = 6%-36%) */
export const arbAnnualRateBps: fc.Arbitrary<number> = fc.integer({
  min: 600,
  max: 3600,
});

/** Valid tenure in months (1-60) */
export const arbTenureMonths: fc.Arbitrary<number> = fc.integer({
  min: 1,
  max: 60,
});

/** Valid interest type */
export const arbInterestType: fc.Arbitrary<'flat' | 'reducing_balance'> =
  fc.constantFrom('flat' as const, 'reducing_balance' as const);

/** Valid repayment frequency */
export const arbFrequency: fc.Arbitrary<'daily' | 'weekly' | 'monthly'> =
  fc.constantFrom('daily' as const, 'weekly' as const, 'monthly' as const);

/** Valid payment mode */
export const arbPaymentMode: fc.Arbitrary<'cash' | 'bank_transfer' | 'online'> =
  fc.constantFrom(
    'cash' as const,
    'bank_transfer' as const,
    'online' as const,
  );

/** Valid loan parameters tuple for schedule generation */
export const arbLoanParams: fc.Arbitrary<{
  principalPaise: number;
  annualRateBps: number;
  tenureMonths: number;
  interestType: 'flat' | 'reducing_balance';
  frequency: 'monthly' | 'weekly' | 'daily';
}> = fc.record({
  principalPaise: fc.integer({ min: 5_000_00, max: 50_000_00 }),
  annualRateBps: arbAnnualRateBps,
  tenureMonths: fc.integer({ min: 3, max: 36 }),
  interestType: arbInterestType,
  frequency: arbFrequency,
});

/** Valid payment sequence: array of positive paise amounts that don't exceed total payable */
export const arbPaymentSequence = (
  totalPayablePaise: number,
  maxPayments: number,
): fc.Arbitrary<number[]> =>
  fc
    .array(
      fc.integer({
        min: 100,
        max: Math.min(totalPayablePaise, 50_000_00),
      }),
      { minLength: 1, maxLength: maxPayments },
    )
    .filter(
      (payments) =>
        payments.reduce((a, b) => a + b, 0) <= totalPayablePaise,
    );

/** Valid state transition pair for loan state machine testing */
export const arbLoanStatusPair: fc.Arbitrary<{ from: string; to: string }> =
  fc.record({
    from: fc.constantFrom(
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'disbursed',
      'active',
      'overdue',
      'defaulted',
      'foreclosed',
      'closed',
    ),
    to: fc.constantFrom(
      'draft',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'disbursed',
      'active',
      'overdue',
      'defaulted',
      'foreclosed',
      'closed',
    ),
  });

/** Valid user role */
export const arbUserRole: fc.Arbitrary<string> = fc.constantFrom(
  'super_admin',
  'manager',
  'field_officer',
  'collection_officer',
  'accountant',
  'office_staff',
  'viewer_auditor',
);

// ─── Invalid Input Generators ───────────────────────────────────────────────

/** Invalid Aadhaar: any string that is NOT exactly 12 digits */
export const arbInvalidAadhaar: fc.Arbitrary<string> = fc.oneof(
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
    minLength: 1,
    maxLength: 11,
  }),
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
    minLength: 13,
    maxLength: 20,
  }),
  fc.stringOf(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    { minLength: 12, maxLength: 12 },
  ),
);

/** Invalid PAN: any string that does NOT match AAAAA9999A */
export const arbInvalidPan: fc.Arbitrary<string> = fc.oneof(
  fc.string({ minLength: 1, maxLength: 9 }),
  fc.string({ minLength: 11, maxLength: 15 }),
  fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
    minLength: 10,
    maxLength: 10,
  }),
);

/** Whitespace-only strings for empty input testing */
export const arbWhitespaceOnly: fc.Arbitrary<string> = fc.stringOf(
  fc.constantFrom(' ', '\t', '\n', '\r'),
  { minLength: 0, maxLength: 20 },
);
