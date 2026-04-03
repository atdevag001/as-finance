import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Extracted logic from StatusBadge component ───────────────────────────────
// Mirrors the mapping logic in apps/web/src/components/shared/status-badge.tsx

type StatusVariant =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'overdue-1'
  | 'overdue-2'
  | 'overdue-3'
  | 'overdue-4';

const LOAN_STATUS_MAP: Record<string, StatusVariant> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'info',
  approved: 'success',
  rejected: 'danger',
  disbursed: 'info',
  active: 'success',
  overdue: 'warning',
  defaulted: 'danger',
  foreclosed: 'warning',
  closed: 'neutral',
};

const OVERDUE_BUCKET_MAP: Record<string, StatusVariant> = {
  bucket_0: 'success',
  bucket_1_30: 'overdue-1',
  bucket_31_60: 'overdue-2',
  bucket_61_90: 'overdue-3',
  bucket_90_plus: 'overdue-4',
};

const INSTALLMENT_STATUS_MAP: Record<string, StatusVariant> = {
  pending: 'neutral',
  partial: 'warning',
  paid: 'success',
  overdue: 'danger',
  closed: 'neutral',
};

const COLLECTION_STATUS_MAP: Record<string, StatusVariant> = {
  posted: 'success',
  reversed: 'danger',
};

const CUSTOMER_STATUS_MAP: Record<string, StatusVariant> = {
  active: 'success',
  blacklisted: 'danger',
  inactive: 'neutral',
};

type StatusType = 'loan' | 'overdue_bucket' | 'installment' | 'collection' | 'customer';

const STATUS_MAPS: Record<StatusType, Record<string, StatusVariant>> = {
  loan: LOAN_STATUS_MAP,
  overdue_bucket: OVERDUE_BUCKET_MAP,
  installment: INSTALLMENT_STATUS_MAP,
  collection: COLLECTION_STATUS_MAP,
  customer: CUSTOMER_STATUS_MAP,
};

/**
 * Resolves the variant for a given status and type, mirroring StatusBadge logic:
 *   const variant = map[status] ?? 'neutral';
 */
function getStatusVariant(status: string, type: StatusType): StatusVariant {
  const map = STATUS_MAPS[type];
  return map[status] ?? 'neutral';
}

// ─── Extracted validation logic for rejection and reversal reasons ─────────────
// Mirrors the constraints from the loan detail page (Requirement 9.7)
// and the reversal form (Requirement 13.2)

/**
 * Validates a loan rejection reason: must be a non-empty string.
 */
function isValidRejectionReason(reason: string): boolean {
  return reason.trim().length > 0;
}

/**
 * Validates a collection reversal reason: must be at least 10 characters.
 */
function isValidReversalReason(reason: string): boolean {
  return reason.trim().length >= 10;
}

// ─── Generators ───────────────────────────────────────────────────────────────

const statusTypeArb: fc.Arbitrary<StatusType> = fc.constantFrom(
  'loan',
  'overdue_bucket',
  'installment',
  'collection',
  'customer',
);

const loanStatusArb = fc.constantFrom(
  'draft', 'submitted', 'under_review', 'approved', 'rejected',
  'disbursed', 'active', 'overdue', 'defaulted', 'foreclosed', 'closed',
);

const installmentStatusArb = fc.constantFrom('pending', 'partial', 'paid', 'overdue', 'closed');

const collectionStatusArb = fc.constantFrom('posted', 'reversed');

const customerStatusArb = fc.constantFrom('active', 'blacklisted', 'inactive');

const overdueBucketArb = fc.constantFrom(
  'bucket_0', 'bucket_1_30', 'bucket_31_60', 'bucket_61_90', 'bucket_90_plus',
);

/** Generates a known status + type pair from the defined maps */
const knownStatusAndTypeArb: fc.Arbitrary<{ status: string; type: StatusType }> = fc.oneof(
  loanStatusArb.map((s) => ({ status: s, type: 'loan' as StatusType })),
  installmentStatusArb.map((s) => ({ status: s, type: 'installment' as StatusType })),
  collectionStatusArb.map((s) => ({ status: s, type: 'collection' as StatusType })),
  customerStatusArb.map((s) => ({ status: s, type: 'customer' as StatusType })),
  overdueBucketArb.map((s) => ({ status: s, type: 'overdue_bucket' as StatusType })),
);

/** Generates an unknown status string (not in any map and not a JS prototype property) */
const allKnownStatuses = new Set([
  ...Object.keys(LOAN_STATUS_MAP),
  ...Object.keys(INSTALLMENT_STATUS_MAP),
  ...Object.keys(COLLECTION_STATUS_MAP),
  ...Object.keys(CUSTOMER_STATUS_MAP),
  ...Object.keys(OVERDUE_BUCKET_MAP),
]);
const protoKeys = new Set(Object.getOwnPropertyNames(Object.prototype));
const unknownStatusArb = fc
  .string({ minLength: 1, maxLength: 30 })
  .filter((s) => !allKnownStatuses.has(s) && !protoKeys.has(s));

/** Non-empty string (at least 1 non-whitespace char) */
const nonEmptyReasonArb = fc
  .string({ minLength: 1, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

/** Empty or whitespace-only string */
const emptyReasonArb = fc.constantFrom('', ' ', '  ', '\t', '\n', '   \t\n  ');

/** String with at least 10 non-whitespace characters */
const validReversalReasonArb = fc
  .string({ minLength: 10, maxLength: 200 })
  .filter((s) => s.trim().length >= 10);

/** String with fewer than 10 characters after trimming */
const shortReversalReasonArb = fc
  .string({ minLength: 0, maxLength: 15 })
  .filter((s) => s.trim().length < 10);

// ─── Property 8: Status badge variant mapping ─────────────────────────────────
// **Validates: Requirements 8.5, 9.4, 11.6, 12.4**

describe('Property 8: Status badge variant mapping', () => {
  it('every known status+type pair maps to the correct variant from the map', () => {
    fc.assert(
      fc.property(knownStatusAndTypeArb, ({ status, type }) => {
        const expected = STATUS_MAPS[type][status];
        const actual = getStatusVariant(status, type);
        expect(actual).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('overdue loan status maps to warning variant', () => {
    fc.assert(
      fc.property(fc.constant('overdue'), (status) => {
        expect(getStatusVariant(status, 'loan')).toBe('warning');
      }),
      { numRuns: 100 },
    );
  });

  it('overdue installment status maps to danger variant', () => {
    fc.assert(
      fc.property(fc.constant('overdue'), (status) => {
        expect(getStatusVariant(status, 'installment')).toBe('danger');
      }),
      { numRuns: 100 },
    );
  });

  it('reversed collection status maps to danger variant', () => {
    fc.assert(
      fc.property(fc.constant('reversed'), (status) => {
        expect(getStatusVariant(status, 'collection')).toBe('danger');
      }),
      { numRuns: 100 },
    );
  });

  it('unknown status strings fall back to neutral for any type', () => {
    fc.assert(
      fc.property(unknownStatusArb, statusTypeArb, (status, type) => {
        expect(getStatusVariant(status, type)).toBe('neutral');
      }),
      { numRuns: 100 },
    );
  });

  it('variant is always one of the defined StatusVariant values', () => {
    const allVariants = new Set<StatusVariant>([
      'success', 'warning', 'danger', 'info', 'neutral',
      'overdue-1', 'overdue-2', 'overdue-3', 'overdue-4',
    ]);
    fc.assert(
      fc.property(
        fc.oneof(knownStatusAndTypeArb, unknownStatusArb.chain((s) => statusTypeArb.map((t) => ({ status: s, type: t })))),
        ({ status, type }) => {
          const variant = getStatusVariant(status, type);
          expect(allVariants.has(variant)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('overdue bucket statuses map to escalating severity variants', () => {
    const bucketOrder: [string, StatusVariant][] = [
      ['bucket_0', 'success'],
      ['bucket_1_30', 'overdue-1'],
      ['bucket_31_60', 'overdue-2'],
      ['bucket_61_90', 'overdue-3'],
      ['bucket_90_plus', 'overdue-4'],
    ];
    fc.assert(
      fc.property(fc.constantFrom(...bucketOrder), ([bucket, expectedVariant]) => {
        expect(getStatusVariant(bucket, 'overdue_bucket')).toBe(expectedVariant);
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Property 14: Rejection and reversal reason validation ────────────────────
// **Validates: Requirements 9.7, 13.2**

describe('Property 14: Rejection and reversal reason validation', () => {
  it('non-empty reason strings are valid for loan rejection', () => {
    fc.assert(
      fc.property(nonEmptyReasonArb, (reason) => {
        expect(isValidRejectionReason(reason)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('empty or whitespace-only strings are invalid for loan rejection', () => {
    fc.assert(
      fc.property(emptyReasonArb, (reason) => {
        expect(isValidRejectionReason(reason)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('reason strings with ≥10 characters are valid for collection reversal', () => {
    fc.assert(
      fc.property(validReversalReasonArb, (reason) => {
        expect(isValidReversalReason(reason)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('reason strings with <10 characters are invalid for collection reversal', () => {
    fc.assert(
      fc.property(shortReversalReasonArb, (reason) => {
        expect(isValidReversalReason(reason)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('any valid reversal reason is also a valid rejection reason', () => {
    fc.assert(
      fc.property(validReversalReasonArb, (reason) => {
        // A reversal reason (≥10 chars) is always non-empty, so it passes rejection validation too
        expect(isValidRejectionReason(reason)).toBe(true);
        expect(isValidReversalReason(reason)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('form should prevent submission when rejection reason is empty', () => {
    fc.assert(
      fc.property(emptyReasonArb, (reason) => {
        const canSubmit = isValidRejectionReason(reason);
        expect(canSubmit).toBe(false);
      }),
      { numRuns: 100 },
    );
  });

  it('form should prevent submission when reversal reason is too short', () => {
    fc.assert(
      fc.property(shortReversalReasonArb, (reason) => {
        const canSubmit = isValidReversalReason(reason);
        expect(canSubmit).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});
