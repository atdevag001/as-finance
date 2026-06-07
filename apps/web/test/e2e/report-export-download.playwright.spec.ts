import { test, expect, getTokenForRole, apiRequest, createTestCustomer, createTestLoan, advanceLoanToStatus, createTestCollection } from './fixtures';
import * as fs from 'fs';

/**
 * Report Export Download Verification — Playwright E2E Tests
 *
 * Closes the gap in reports.playwright.spec.ts where export buttons are
 * clicked but the downloaded artifact is never opened. Regulatory
 * portfolio / demand exports going out without filter integrity is a
 * real risk, so these tests:
 *
 *  1. Capture the actual download stream from the browser.
 *  2. Assert the suggested filename and Content-Type header carry the
 *     correct format hint.
 *  3. Read the saved file from disk and verify the binary magic bytes
 *     (%PDF- / PK\x03\x04) and a non-zero payload.
 *  4. Intercept the underlying /reports/.../export network request and
 *     assert that the date-range and (where applicable) status filter
 *     selected in the UI is forwarded to the backend query string —
 *     i.e. the export honours the same filter as the on-screen data.
 *  5. RBAC negative path — field_officer (no report.export permission)
 *     cannot trigger a download even by issuing the same network call.
 *
 * NOTE on report-type choice:
 *   The reports hub aliases like `collection-summary` / `portfolio` in
 *   the existing spec are not in the API's REPORT_TYPES whitelist. We
 *   use `loan-portfolio` and `daily-collection`, which are the real
 *   canonical types (see apps/api/src/modules/report/report.service.ts).
 */

const PDF_MAGIC = '%PDF-';
// XLSX is a ZIP archive — first 4 bytes are 0x50 0x4B 0x03 0x04 ("PK\x03\x04").
const XLSX_MAGIC_HEX = '504b0304';

const PDF_MIME = 'application/pdf';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Seeded date range — chosen wide enough that loan-portfolio always returns
// at least the disbursed loan we create in beforeAll.
const RANGE_START = '2024-01-01';
const RANGE_END = '2024-12-31';

test.describe('Report Export — Download Verification', () => {
  // Seed one disbursed loan + one collection so portfolio / daily-collection
  // exports have something to render, while still being tolerant of empty
  // result sets (PDF/XLSX exporters write a valid file with header rows
  // even when there are zero data rows).
  test.beforeAll(async () => {
    try {
      const token = await getTokenForRole('manager');
      const customerId = await createTestCustomer(token);
      const loanId = await createTestLoan(token, customerId);
      await advanceLoanToStatus(token, loanId, 'disbursed');
      await createTestCollection(token, loanId, 100000); // ₹1,000
    } catch {
      // Seeding is best-effort. The export endpoint still emits a valid
      // PDF/XLSX with summary rows when zero data rows match, so the
      // magic-byte + non-empty-payload assertions remain meaningful.
    }
  });

  test.describe('PDF export — content verification', () => {
    test('manager downloads a real PDF with %PDF- magic bytes and non-empty payload', async ({ managerPage }) => {
      await managerPage.goto('/reports/loan-portfolio');
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.getByRole('heading', { name: /loan portfolio/i })).toBeVisible({ timeout: 30_000 });

      // Set an explicit date range so the test is deterministic.
      const dateInputs = managerPage.locator('input[type="date"]');
      await expect(dateInputs.first()).toBeVisible({ timeout: 20_000 });
      // End date constraint: min=startDate, so set start first.
      await dateInputs.nth(0).fill(RANGE_START);
      await dateInputs.nth(1).fill(RANGE_END);

      const pdfButton = managerPage.getByRole('button', { name: /^pdf$/i });
      await expect(pdfButton).toBeEnabled({ timeout: 15_000 });

      // Wait for both the download event AND the underlying API call.
      const [download, exportRequest] = await Promise.all([
        managerPage.waitForEvent('download', { timeout: 30_000 }),
        managerPage.waitForRequest((req) => req.url().includes('/reports/loan-portfolio/export') && req.url().includes('format=pdf'), { timeout: 30_000 }),
        pdfButton.click(),
      ]);

      // Suggested filename should advertise .pdf
      const suggested = download.suggestedFilename();
      expect(suggested.toLowerCase()).toMatch(/\.pdf$/);

      // Save and inspect the actual bytes — this is the gap-closing assertion.
      const savePath = await download.path();
      expect(savePath).toBeTruthy();
      const buf = fs.readFileSync(savePath!);
      expect(buf.length).toBeGreaterThan(0);
      // PDF magic — first 5 bytes are literally "%PDF-"
      expect(buf.slice(0, 5).toString('ascii')).toBe(PDF_MAGIC);

      // Date-range filter integrity: the request URL must carry the dates we picked.
      const url = new URL(exportRequest.url());
      expect(url.searchParams.get('startDate')).toBe(RANGE_START);
      expect(url.searchParams.get('endDate')).toBe(RANGE_END);
      expect(url.searchParams.get('format')).toBe('pdf');

      // And the response MIME advertises PDF — caught at the network layer
      // because the browser strips Content-Type from `download` events.
      const response = await exportRequest.response();
      expect(response).not.toBeNull();
      const contentType = response!.headers()['content-type'] ?? '';
      expect(contentType.toLowerCase()).toContain(PDF_MIME);

      // Success toast confirms the UI also believes the export worked.
      await expect(managerPage.getByText(/pdf export downloaded/i)).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Excel export — content verification', () => {
    test('manager downloads a real XLSX with PK ZIP magic bytes and xlsx MIME', async ({ managerPage }) => {
      await managerPage.goto('/reports/daily-collection');
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.getByRole('heading', { name: /daily collection/i })).toBeVisible({ timeout: 30_000 });

      const dateInputs = managerPage.locator('input[type="date"]');
      await expect(dateInputs.first()).toBeVisible({ timeout: 20_000 });
      await dateInputs.nth(0).fill(RANGE_START);
      await dateInputs.nth(1).fill(RANGE_END);

      const excelButton = managerPage.getByRole('button', { name: /^excel$/i });
      await expect(excelButton).toBeEnabled({ timeout: 15_000 });

      const [download, exportRequest] = await Promise.all([
        managerPage.waitForEvent('download', { timeout: 30_000 }),
        // UI converts 'excel' -> 'xlsx' before sending. Assert on the
        // wire-level value so we catch any regression in that mapping.
        managerPage.waitForRequest((req) => req.url().includes('/reports/daily-collection/export') && req.url().includes('format=xlsx'), { timeout: 30_000 }),
        excelButton.click(),
      ]);

      const suggested = download.suggestedFilename();
      expect(suggested.toLowerCase()).toMatch(/\.xlsx$/);

      const savePath = await download.path();
      expect(savePath).toBeTruthy();
      const buf = fs.readFileSync(savePath!);
      expect(buf.length).toBeGreaterThan(0);
      // XLSX magic — first 4 bytes of any ZIP container.
      expect(buf.slice(0, 4).toString('hex')).toBe(XLSX_MAGIC_HEX);

      // Date-range filter integrity: backend must receive the dates picked in the UI.
      const url = new URL(exportRequest.url());
      expect(url.searchParams.get('startDate')).toBe(RANGE_START);
      expect(url.searchParams.get('endDate')).toBe(RANGE_END);
      expect(url.searchParams.get('format')).toBe('xlsx');

      const response = await exportRequest.response();
      expect(response).not.toBeNull();
      const contentType = response!.headers()['content-type'] ?? '';
      expect(contentType.toLowerCase()).toContain(XLSX_MIME);

      await expect(managerPage.getByText(/excel export downloaded/i)).toBeVisible({ timeout: 15_000 });
    });
  });

  test.describe('Filter integrity — UI changes propagate to export', () => {
    test('emi-schedule export forwards scheduleStatus filter to backend query string', async ({ managerPage }) => {
      // emi-schedule is the only report type that exposes the extra
      // `status` selector in the UI — so it's the right surface to prove
      // that non-date filters also reach the export endpoint.
      await managerPage.goto('/reports/emi-schedule');
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.getByRole('heading', { name: /emi schedule/i })).toBeVisible({ timeout: 30_000 });

      const dateInputs = managerPage.locator('input[type="date"]');
      await dateInputs.nth(0).fill(RANGE_START);
      await dateInputs.nth(1).fill(RANGE_END);

      // Pick a non-default status so we can prove it travels.
      const statusTrigger = managerPage.getByRole('combobox');
      await expect(statusTrigger).toBeVisible({ timeout: 15_000 });
      await statusTrigger.click();
      await managerPage.getByRole('option', { name: /^unpaid$/i }).click();

      const pdfButton = managerPage.getByRole('button', { name: /^pdf$/i });
      await expect(pdfButton).toBeEnabled({ timeout: 15_000 });

      const [download, exportRequest] = await Promise.all([
        managerPage.waitForEvent('download', { timeout: 30_000 }),
        managerPage.waitForRequest((req) => req.url().includes('/reports/emi-schedule/export'), { timeout: 30_000 }),
        pdfButton.click(),
      ]);

      const url = new URL(exportRequest.url());
      expect(url.searchParams.get('startDate')).toBe(RANGE_START);
      expect(url.searchParams.get('endDate')).toBe(RANGE_END);
      expect(url.searchParams.get('scheduleStatus')).toBe('unpaid');
      expect(url.searchParams.get('format')).toBe('pdf');

      const buf = fs.readFileSync((await download.path())!);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.slice(0, 5).toString('ascii')).toBe(PDF_MAGIC);
    });

    test('invalid date range (end < start) disables export buttons — no malformed request can be sent', async ({ managerPage }) => {
      await managerPage.goto('/reports/loan-portfolio');
      await managerPage.waitForLoadState('domcontentloaded');
      await expect(managerPage.getByRole('heading', { name: /loan portfolio/i })).toBeVisible({ timeout: 30_000 });

      // The `min`/`max` HTML constraints prevent the user from picking an
      // inverted range through the UI, so we set the values via JS to
      // simulate a corrupted state and confirm the guard still holds.
      const dateInputs = managerPage.locator('input[type="date"]');
      await dateInputs.nth(0).fill('2024-06-01');
      // Use evaluate to bypass the min attribute the browser would enforce.
      await dateInputs.nth(1).evaluate((el, val) => {
        const input = el as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, val);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, '2024-01-01');

      // Inverted-range banner appears.
      await expect(managerPage.getByText(/end date must be on or after start date/i)).toBeVisible({ timeout: 15_000 });

      // Both export buttons must be disabled — i.e. no regulatory export
      // can be triggered with a corrupted filter.
      await expect(managerPage.getByRole('button', { name: /^pdf$/i })).toBeDisabled({ timeout: 15_000 });
      await expect(managerPage.getByRole('button', { name: /^excel$/i })).toBeDisabled({ timeout: 15_000 });
    });
  });

  test.describe('RBAC — export permission boundary', () => {
    test('field_officer sees no export buttons and API rejects direct export call', async ({ fieldOfficerPage }) => {
      await fieldOfficerPage.goto('/reports/loan-portfolio');
      await fieldOfficerPage.waitForLoadState('domcontentloaded');

      // Either the page renders the report (read permission only) without
      // export buttons, or the role is denied entirely — both prove the
      // boundary. We assert specifically on the export controls being absent.
      const heading = fieldOfficerPage.getByRole('heading', { name: /loan portfolio|access denied/i });
      await expect(heading).toBeVisible({ timeout: 30_000 });

      await expect(fieldOfficerPage.getByRole('button', { name: /^pdf$/i })).toHaveCount(0, { timeout: 15_000 });
      await expect(fieldOfficerPage.getByRole('button', { name: /^excel$/i })).toHaveCount(0, { timeout: 15_000 });

      // Defence-in-depth: even if a field officer crafts the export URL by
      // hand, the API must reject it. Hitting the backend directly proves
      // the RBAC guard is not just a client-side hide.
      const token = await getTokenForRole('field_officer');
      let rejected = false;
      try {
        await apiRequest(
          'GET',
          `/reports/loan-portfolio/export?startDate=${RANGE_START}&endDate=${RANGE_END}&format=pdf`,
          token,
        );
      } catch (err) {
        // apiRequest throws on non-2xx. 403 (forbidden) is the canonical
        // RBAC denial; 401 would also be acceptable for an unauth user.
        const msg = (err as Error).message;
        expect(msg).toMatch(/40[13]/);
        rejected = true;
      }
      expect(rejected).toBe(true);
    });
  });
});
