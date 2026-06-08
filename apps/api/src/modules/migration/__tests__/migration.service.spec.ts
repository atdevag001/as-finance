import { describe, it, expect, beforeAll } from 'vitest';
import * as ExcelJS from 'exceljs';
import { MigrationService } from '../migration.service';
import { ExcelService } from '../../excel/excel.service';
import type { MigrationDomain } from '../migration.types';

// ──────────────────────────────────────────────────────────────────────
// Minimal stubs — generateTemplate + dryRun only touch ExcelService and
// SettingsService.findAll. The rest stays mocked-out so we avoid spinning
// up Prisma for what are pure validation tests.
// ──────────────────────────────────────────────────────────────────────
function makeService(): MigrationService {
  const settings = {
    findAll: async () => [],
  } as unknown as ConstructorParameters<typeof MigrationService>[3];

  const prisma = {} as unknown as ConstructorParameters<typeof MigrationService>[0];
  const audit = {} as unknown as ConstructorParameters<typeof MigrationService>[2];
  const encryption = {} as unknown as ConstructorParameters<typeof MigrationService>[4];

  return new MigrationService(prisma, new ExcelService(), audit, settings, encryption);
}

// ──────────────────────────────────────────────────────────────────────
// Helper: build a workbook in the same shape generateTemplate emits, so
// we can edit individual cells and re-feed it to dryRun.
// ──────────────────────────────────────────────────────────────────────
async function buildXlsx(
  headers: string[],
  dataRows: Array<Record<string, string | number>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Data');
  sheet.addRow(headers);
  for (const r of dataRows) {
    sheet.addRow(headers.map((h) => r[h] ?? ''));
  }
  const arr = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return Buffer.from(arr);
}

// ──────────────────────────────────────────────────────────────────────
// generateTemplate — every template the dashboard "Template" button
// hands operators must round-trip through dryRun without any header
// mismatch errors.
// ──────────────────────────────────────────────────────────────────────
describe('MigrationService.generateTemplate', () => {
  const svc = makeService();
  const DOMAINS: MigrationDomain[] = ['customers', 'groups', 'group_members', 'loans', 'collections'];

  for (const domain of DOMAINS) {
    it(`emits a valid xlsx for ${domain} with Data + Instructions sheets`, async () => {
      const buf = await svc.generateTemplate(domain);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      expect(wb.worksheets.map((s) => s.name)).toEqual(['Data', 'Instructions']);
      const data = wb.getWorksheet('Data')!;
      expect(data.rowCount).toBe(2); // header + 1 example row
      // The header MUST be on row 1 (no title row in templates — round-trip safe).
      const header = data.getRow(1);
      header.eachCell((c) => expect(String(c.value).length).toBeGreaterThan(0));
    });
  }

  it('customers template round-trips through dryRun with the example row valid', async () => {
    const svc2 = makeService();
    const buf = await svc2.generateTemplate('customers');
    const result = await svc2.dryRun(
      { customers: { buffer: buf, originalname: 'customers-template.xlsx' } },
      { id: '00000000-0000-0000-0000-000000000001', role: 'super_admin' },
    );
    expect(result.totals.customers).toBe(1);
    expect(result.errors).toEqual([]); // the example row is valid by construction
  });

  it('loans template round-trips through dryRun (with customer cross-ref provided)', async () => {
    const svc2 = makeService();
    const customersBuf = await svc2.generateTemplate('customers');
    const loansBuf = await svc2.generateTemplate('loans');
    const result = await svc2.dryRun(
      {
        customers: { buffer: customersBuf, originalname: 'c.xlsx' },
        loans: { buffer: loansBuf, originalname: 'l.xlsx' },
      },
      { id: '00000000-0000-0000-0000-000000000001', role: 'super_admin' },
    );
    expect(result.totals.loans).toBe(1);
    // The loans example references customer "CUST-007" which is exactly the
    // customers example — round-trips clean.
    expect(result.errors.filter((e) => e.domain === 'loans')).toEqual([]);
  });

  it('throws BadRequestException for an unknown domain', async () => {
    const svc2 = makeService();
    await expect(svc2.generateTemplate('bogus' as MigrationDomain)).rejects.toThrow(/Unknown migration domain/);
  });
});

// ──────────────────────────────────────────────────────────────────────
// dryRun validations — every new check we added during the
// adversarial review must reject the bad row and identify it.
// ──────────────────────────────────────────────────────────────────────
describe('MigrationService.dryRun — validations', () => {
  let svc: MigrationService;
  beforeAll(() => {
    svc = makeService();
  });

  const CUSTOMER_COLS = [
    'legacy_customer_id',
    'full_name',
    'mobile',
    'aadhaar',
    'gender',
    'address_line1',
    'city',
    'district',
    'state',
    'pincode',
  ];

  const VALID_CUSTOMER = {
    legacy_customer_id: 'CUST-001',
    full_name: 'Test Customer',
    mobile: '9876543210',
    aadhaar: '123412341234',
    gender: 'male',
    address_line1: 'Addr',
    city: 'Pune',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '411001',
  };

  const actor = { id: '00000000-0000-0000-0000-000000000001', role: 'super_admin' };

  it('accepts a valid customer row with zero errors', async () => {
    const buf = await buildXlsx(CUSTOMER_COLS, [VALID_CUSTOMER]);
    const result = await svc.dryRun({ customers: { buffer: buf, originalname: 't.xlsx' } }, actor);
    expect(result.totals.customers).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it('rejects a 5-digit pincode (the silent-truncation bug — fixed)', async () => {
    const buf = await buildXlsx(CUSTOMER_COLS, [{ ...VALID_CUSTOMER, pincode: '41100' }]);
    const result = await svc.dryRun({ customers: { buffer: buf, originalname: 't.xlsx' } }, actor);
    const err = result.errors.find((e) => e.column === 'pincode');
    expect(err, 'expected a pincode error').toBeDefined();
    expect(err!.message).toMatch(/pincode must be exactly 6 digits/);
    expect(err!.rowIndex).toBe(1);
  });

  it('rejects a 7-digit pincode (truncation hides typos)', async () => {
    const buf = await buildXlsx(CUSTOMER_COLS, [{ ...VALID_CUSTOMER, pincode: '4110017' }]);
    const result = await svc.dryRun({ customers: { buffer: buf, originalname: 't.xlsx' } }, actor);
    expect(result.errors.some((e) => e.column === 'pincode')).toBe(true);
  });

  it('rejects a pincode with letters', async () => {
    const buf = await buildXlsx(CUSTOMER_COLS, [{ ...VALID_CUSTOMER, pincode: '4110AB' }]);
    const result = await svc.dryRun({ customers: { buffer: buf, originalname: 't.xlsx' } }, actor);
    expect(result.errors.some((e) => e.column === 'pincode')).toBe(true);
  });

  it('detects duplicate legacy_customer_id (would otherwise collide on commit)', async () => {
    const buf = await buildXlsx(CUSTOMER_COLS, [VALID_CUSTOMER, VALID_CUSTOMER]);
    const result = await svc.dryRun({ customers: { buffer: buf, originalname: 't.xlsx' } }, actor);
    const dupe = result.errors.find((e) => /Duplicate legacy_customer_id/.test(e.message));
    expect(dupe, 'expected a duplicate-id error').toBeDefined();
    expect(dupe!.column).toBe('legacy_customer_id');
    // The dup detection reports against the SECOND occurrence (row 2 in this file).
    expect(dupe!.rowIndex).toBe(2);
  });

  it('case-insensitive status — uppercase "ACTIVE" does not error', async () => {
    const buf = await buildXlsx([...CUSTOMER_COLS, 'status'], [
      { ...VALID_CUSTOMER, status: 'ACTIVE' },
    ]);
    const result = await svc.dryRun({ customers: { buffer: buf, originalname: 't.xlsx' } }, actor);
    expect(result.errors).toEqual([]);
  });

  // ── Loans-specific validations ─────────────────────────────────────────
  const LOAN_COLS = [
    'legacy_loan_id',
    'customer_legacy_customer_id',
    'principal_paise',
    'total_interest_paise',
    'total_payable_paise',
    'tenure_months',
    'installments_paid_count',
    'emi_paise',
    'purpose',
    'status',
    'cached_outstanding_paise',
    'disbursement_date',
    'first_due_date',
  ];
  const VALID_LOAN = {
    legacy_loan_id: 'LN-001',
    customer_legacy_customer_id: 'CUST-001',
    principal_paise: 1000000,
    total_interest_paise: 120000,
    total_payable_paise: 1120000,
    tenure_months: 12,
    emi_paise: 93333,
    purpose: 'business',
    status: 'active',
    cached_outstanding_paise: 800000,
    disbursement_date: '2025-01-15',
    first_due_date: '2025-02-15',
  };

  async function dryRunWithLoan(loan: Record<string, string | number>) {
    const customersBuf = await buildXlsx(CUSTOMER_COLS, [VALID_CUSTOMER]);
    const loansBuf = await buildXlsx(LOAN_COLS, [loan]);
    return svc.dryRun(
      {
        customers: { buffer: customersBuf, originalname: 'c.xlsx' },
        loans: { buffer: loansBuf, originalname: 'l.xlsx' },
      },
      actor,
    );
  }

  it('rejects decimal paise (BigInt(SyntaxError) mid-tx bug — fixed)', async () => {
    const result = await dryRunWithLoan({ ...VALID_LOAN, principal_paise: 12345.67 });
    const err = result.errors.find((e) => e.column === 'principal_paise');
    expect(err, 'expected a paise integer error').toBeDefined();
    expect(err!.message).toMatch(/non-negative integer/);
  });

  it('rejects tenure_months = 0 (BigInt division by zero — fixed)', async () => {
    const result = await dryRunWithLoan({ ...VALID_LOAN, tenure_months: 0 });
    expect(result.errors.some((e) => e.column === 'tenure_months')).toBe(true);
  });

  it('rejects installments_paid_count > tenure_months', async () => {
    const result = await dryRunWithLoan({
      ...VALID_LOAN,
      tenure_months: 12,
      installments_paid_count: 15,
    });
    expect(result.errors.some((e) => e.column === 'installments_paid_count')).toBe(true);
  });

  it('accepts uppercase loan status "OVERDUE"', async () => {
    const result = await dryRunWithLoan({ ...VALID_LOAN, status: 'OVERDUE' });
    expect(result.errors.filter((e) => e.column === 'status')).toEqual([]);
  });

  it('flags an unknown legacy customer id (cross-reference resolution)', async () => {
    const result = await dryRunWithLoan({
      ...VALID_LOAN,
      customer_legacy_customer_id: 'CUST-NOTREAL',
    });
    const err = result.errors.find((e) => e.column === 'customer_legacy_customer_id');
    expect(err, 'expected a cross-reference error').toBeDefined();
    expect(err!.rowIndex).toBe(1); // real row, not 0
  });

  // ── Collections duplicate detection ────────────────────────────────────
  const COLLECTION_COLS = [
    'legacy_collection_id',
    'loan_legacy_loan_id',
    'amount_paise',
    'payment_date',
    'payment_mode',
  ];

  it('detects duplicate legacy_collection_id (idempotency-key collision — fixed)', async () => {
    const customersBuf = await buildXlsx(CUSTOMER_COLS, [VALID_CUSTOMER]);
    const loansBuf = await buildXlsx(LOAN_COLS, [VALID_LOAN]);
    const collectionsBuf = await buildXlsx(COLLECTION_COLS, [
      { legacy_collection_id: 'COLL-1', loan_legacy_loan_id: 'LN-001', amount_paise: 93333, payment_date: '2025-02-15', payment_mode: 'cash' },
      { legacy_collection_id: 'COLL-1', loan_legacy_loan_id: 'LN-001', amount_paise: 93333, payment_date: '2025-03-15', payment_mode: 'cash' },
    ]);
    const result = await svc.dryRun(
      {
        customers: { buffer: customersBuf, originalname: 'c.xlsx' },
        loans: { buffer: loansBuf, originalname: 'l.xlsx' },
        collections: { buffer: collectionsBuf, originalname: 'col.xlsx' },
      },
      actor,
    );
    const err = result.errors.find((e) => /Duplicate legacy_collection_id/.test(e.message));
    expect(err, 'expected duplicate collection id error').toBeDefined();
    expect(err!.rowIndex).toBe(2);
  });
});
