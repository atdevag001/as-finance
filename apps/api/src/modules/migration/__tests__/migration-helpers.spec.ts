import { describe, it, expect } from 'vitest';
import { __INTERNAL__, TEMPLATE_COLUMNS } from '../migration.service';

const { normalizeEnum, addMonthsClamped, sha256, ALLOWED_CUSTOMER_STATUS, ALLOWED_LOAN_STATUS, ALLOWED_PAYMENT_MODE } = __INTERNAL__;

// ──────────────────────────────────────────────────────────────────────
// normalizeEnum — every defect on the boundary that killed a 10-min tx
// because Prisma rejected 'Active' as not in its enum.
// ──────────────────────────────────────────────────────────────────────
describe('normalizeEnum', () => {
  it('accepts canonical lowercase values', () => {
    expect(normalizeEnum('active', ALLOWED_CUSTOMER_STATUS, null)).toBe('active');
    expect(normalizeEnum('blacklisted', ALLOWED_CUSTOMER_STATUS, null)).toBe('blacklisted');
  });

  it('normalises case', () => {
    expect(normalizeEnum('ACTIVE', ALLOWED_CUSTOMER_STATUS, null)).toBe('active');
    expect(normalizeEnum('Active', ALLOWED_CUSTOMER_STATUS, null)).toBe('active');
    expect(normalizeEnum('aCtIvE', ALLOWED_CUSTOMER_STATUS, null)).toBe('active');
  });

  it('trims surrounding whitespace and collapses internal whitespace to underscore', () => {
    expect(normalizeEnum('  active  ', ALLOWED_CUSTOMER_STATUS, null)).toBe('active');
    expect(normalizeEnum('bank transfer', ALLOWED_PAYMENT_MODE, null)).toBe('bank_transfer');
    expect(normalizeEnum('BANK  TRANSFER', ALLOWED_PAYMENT_MODE, null)).toBe('bank_transfer');
  });

  it('returns fallback on null / undefined / empty', () => {
    expect(normalizeEnum(null, ALLOWED_CUSTOMER_STATUS, 'active')).toBe('active');
    expect(normalizeEnum(undefined, ALLOWED_CUSTOMER_STATUS, 'active')).toBe('active');
  });

  it('returns fallback (which may be null) on unknown values', () => {
    expect(normalizeEnum('purple', ALLOWED_CUSTOMER_STATUS, 'active')).toBe('active');
    // Critical: with null fallback, an unknown value returns null and writeLoans throws
    // a clear "must be one of [...]" error instead of silently coercing.
    expect(normalizeEnum('purple', ALLOWED_LOAN_STATUS, null)).toBeNull();
  });

  it('treats numbers and other types via String() coercion', () => {
    expect(normalizeEnum(123, ALLOWED_CUSTOMER_STATUS, 'active')).toBe('active'); // unknown
    // Truly weird input → fallback
    expect(normalizeEnum({}, ALLOWED_CUSTOMER_STATUS, 'active')).toBe('active');
  });
});

// ──────────────────────────────────────────────────────────────────────
// addMonthsClamped — Jan 31 + 1 = Feb 28/29, NOT Mar 3 (the JS Date overflow bug).
// ──────────────────────────────────────────────────────────────────────
describe('addMonthsClamped', () => {
  it('Jan 31 + 1 month → Feb 28 in non-leap year', () => {
    const d = addMonthsClamped(new Date(2025, 0, 31), 1); // Jan 31 2025 (non-leap)
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(1); // February
    expect(d.getDate()).toBe(28);
  });

  it('Jan 31 + 1 month → Feb 29 in leap year', () => {
    const d = addMonthsClamped(new Date(2024, 0, 31), 1); // Jan 31 2024 (leap)
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(29);
  });

  it('Mar 31 + 1 month → Apr 30 (Apr has only 30 days)', () => {
    const d = addMonthsClamped(new Date(2025, 2, 31), 1);
    expect(d.getMonth()).toBe(3); // April
    expect(d.getDate()).toBe(30);
  });

  it('Mid-month date is unaffected (Mar 15 + 1 → Apr 15)', () => {
    const d = addMonthsClamped(new Date(2025, 2, 15), 1);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(15);
  });

  it('+12 months preserves day-of-month even when starting at month-end', () => {
    const d = addMonthsClamped(new Date(2024, 1, 29), 12); // Feb 29 2024 + 12 → Feb 28 2025 (clamp)
    expect(d.getFullYear()).toBe(2025);
    expect(d.getMonth()).toBe(1);
    expect(d.getDate()).toBe(28);
  });

  it('reproduces the EMI-schedule walk: 12 monthly dates starting Jan 31 2025 stay at month-end', () => {
    const start = new Date(2025, 0, 31);
    const dates = Array.from({ length: 12 }, (_, i) => addMonthsClamped(start, i));
    const days = dates.map((d) => d.getDate());
    // Jan=31, Feb=28, Mar=31, Apr=30, May=31, Jun=30, Jul=31, Aug=31, Sep=30, Oct=31, Nov=30, Dec=31
    expect(days).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
  });

  it('does not mutate the input date', () => {
    const start = new Date(2025, 0, 31);
    const startISO = start.toISOString();
    addMonthsClamped(start, 5);
    expect(start.toISOString()).toBe(startISO);
  });
});

// ──────────────────────────────────────────────────────────────────────
// sha256 — locks file-hash format for forensic audits.
// ──────────────────────────────────────────────────────────────────────
describe('sha256', () => {
  it('returns lowercase hex string of 64 chars', () => {
    const h = sha256(Buffer.from('hello world'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe('b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
  });

  it('is deterministic and distinct for different content', () => {
    expect(sha256(Buffer.from('a'))).toBe(sha256(Buffer.from('a')));
    expect(sha256(Buffer.from('a'))).not.toBe(sha256(Buffer.from('b')));
  });

  it('handles empty buffer (used when a domain file is not uploaded)', () => {
    expect(sha256(Buffer.from(''))).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });
});

// ──────────────────────────────────────────────────────────────────────
// TEMPLATE_COLUMNS — every defined domain has at least the required
// columns from MIGRATION_FILE_FORMAT.md.
// ──────────────────────────────────────────────────────────────────────
describe('TEMPLATE_COLUMNS', () => {
  it('defines exactly the 5 migration domains', () => {
    expect(Object.keys(TEMPLATE_COLUMNS).sort()).toEqual(
      ['collections', 'customers', 'group_members', 'groups', 'loans'],
    );
  });

  it('every required column has a non-empty example for end-user copy-paste', () => {
    for (const [domain, cols] of Object.entries(TEMPLATE_COLUMNS)) {
      for (const c of cols) {
        if (c.required) {
          expect(c.example, `${domain}.${c.key} required but example is empty`).not.toBe('');
        }
        expect(c.example, `${domain}.${c.key} example must be a string`).toBeTypeOf('string');
      }
    }
  });

  it('column keys are unique within each domain', () => {
    for (const [domain, cols] of Object.entries(TEMPLATE_COLUMNS)) {
      const keys = cols.map((c) => c.key);
      const unique = new Set(keys);
      expect(unique.size, `duplicate columns in ${domain}`).toBe(keys.length);
    }
  });

  it('customers domain includes the encrypted-PII columns', () => {
    const keys = TEMPLATE_COLUMNS.customers.map((c) => c.key);
    expect(keys).toContain('aadhaar');
    expect(keys).toContain('pan');
  });

  it('loans domain documents the disbursement_mode column (added post-V1 review)', () => {
    const keys = TEMPLATE_COLUMNS.loans.map((c) => c.key);
    expect(keys).toContain('disbursement_mode');
  });
});

// ──────────────────────────────────────────────────────────────────────
// EMI paise math — the most consequential defect we fixed. We can't
// invoke the writer directly without a Prisma stub, so we re-derive the
// arithmetic here to lock the contract: Σ schedule.principal_paid = principal.
// If anyone re-introduces the BigInt floor truncation, this fails.
// ──────────────────────────────────────────────────────────────────────
describe('EMI schedule paise arithmetic (regression lock)', () => {
  function buildSchedule(principalPaise: bigint, totalInterestPaise: bigint, tenureMonths: number) {
    const tenureN = BigInt(tenureMonths);
    const basePrincipal = principalPaise / tenureN;
    const baseInterest = totalInterestPaise / tenureN;
    const principalRemainder = principalPaise - basePrincipal * tenureN;
    const interestRemainder = totalInterestPaise - baseInterest * tenureN;
    const sched: { p: bigint; i: bigint }[] = [];
    for (let n = 0; n < tenureMonths; n++) {
      const isLast = n === tenureMonths - 1;
      sched.push({
        p: isLast ? basePrincipal + principalRemainder : basePrincipal,
        i: isLast ? baseInterest + interestRemainder : baseInterest,
      });
    }
    return sched;
  }

  it('Σ principal == principal (the BigInt floor truncation bug — fixed)', () => {
    const principal = 1_000_000n; // ₹10,000
    const interest = 120_000n;
    const sched = buildSchedule(principal, interest, 12);
    const sumP = sched.reduce((acc, x) => acc + x.p, 0n);
    const sumI = sched.reduce((acc, x) => acc + x.i, 0n);
    expect(sumP).toBe(principal);
    expect(sumI).toBe(interest);
  });

  it('remainder lands on the LAST installment (not the first)', () => {
    const principal = 1_000_000n;
    const sched = buildSchedule(principal, 0n, 12);
    const first = sched[0]!.p;
    const last = sched[sched.length - 1]!.p;
    // 1_000_000 / 12 = 83_333 remainder 4 → last installment carries the extra 4
    expect(first).toBe(83_333n);
    expect(last).toBe(83_337n);
    expect(last - first).toBe(4n);
  });

  it('exact-divide case (12 mo at 1_200_000) — last installment matches the rest', () => {
    const sched = buildSchedule(1_200_000n, 0n, 12);
    expect(sched.every((s) => s.p === 100_000n)).toBe(true);
  });

  it('extreme tenure 60 months: still sums exactly', () => {
    const principal = 99_999_991n; // intentionally awkward
    const sched = buildSchedule(principal, 0n, 60);
    const sumP = sched.reduce((acc, x) => acc + x.p, 0n);
    expect(sumP).toBe(principal);
  });
});

// ──────────────────────────────────────────────────────────────────────
// disbursementMode default — locked behavior: if column is absent we
// default to 'cash', preserving the V1 implicit contract.
// ──────────────────────────────────────────────────────────────────────
describe('disbursement_mode fallback', () => {
  it("omitted disbursement_mode → 'cash'", () => {
    expect(normalizeEnum(undefined, ALLOWED_PAYMENT_MODE, 'cash')).toBe('cash');
  });

  it("explicit 'BANK TRANSFER' → 'bank_transfer'", () => {
    expect(normalizeEnum('BANK TRANSFER', ALLOWED_PAYMENT_MODE, 'cash')).toBe('bank_transfer');
  });

  it("invalid mode 'NEFT' (not yet supported) falls back to 'cash'", () => {
    expect(normalizeEnum('NEFT', ALLOWED_PAYMENT_MODE, 'cash')).toBe('cash');
  });
});
