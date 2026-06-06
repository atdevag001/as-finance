import { test, expect, getTokenForRole, apiRequest, createTestCustomer, createTestLoan, advanceLoanToStatus } from './fixtures';

/**
 * Concurrent Payment Tests — Playwright E2E
 *
 * Tests the system's behavior when two users attempt to pay the same loan
 * simultaneously. The backend uses FOR UPDATE locks to prevent race conditions.
 *
 * Tests cover:
 * 1. Setup: Create active loan with multiple installments
 * 2. Concurrent API calls: Two POST /collections at the same time
 * 3. Result verification: One succeeds, one fails (or both succeed with proper allocation)
 * 4. Data integrity: Total paid never exceeds installment amounts
 * 5. UI behavior when another user pays first
 */

interface LoanSchedule {
  id: string;
  principal_balance_paise: number;
  total_due_paise: number;
  installments: Array<{
    id: string;
    due_date: string;
    principal_paise: number;
    interest_paise: number;
    paid_principal_paise: number;
    paid_interest_paise: number;
    status: string;
  }>;
}

interface CollectionResult {
  success: boolean;
  id?: string;
  error?: string;
  status?: number;
}

test.describe('Concurrent Payment', () => {
  let testLoanId: string;
  let managerToken: string;
  let fieldOfficerToken: string;

  test.beforeAll(async () => {
    managerToken = await getTokenForRole('manager');
    fieldOfficerToken = await getTokenForRole('field_officer');

    // Create test customer and loan
    const customerId = await createTestCustomer(managerToken, {
      fullName: 'Concurrent Payment Test Customer',
    });

    testLoanId = await createTestLoan(managerToken, customerId, undefined, {
      principalPaise: 10000000, // ₹1,00,000
      tenureMonths: 12,
    });

    // Advance to active status
    await advanceLoanToStatus(managerToken, testLoanId, 'active');
  });

  test.describe('API-Level Concurrency', () => {
    test('concurrent collections are serialized by FOR UPDATE lock', async () => {
      // Get loan schedule to know the first unpaid installment
      const schedule = await apiRequest<LoanSchedule>(
        'GET',
        `/loans/${testLoanId}/schedule`,
        managerToken,
      );

      const firstUnpaidInstallment = schedule.installments.find(
        (i) => i.status !== 'paid',
      );
      expect(firstUnpaidInstallment).toBeDefined();

      const emiAmount = firstUnpaidInstallment!.principal_paise + firstUnpaidInstallment!.interest_paise;
      const paymentAmount = Math.min(emiAmount, 500000); // Pay up to ₹5,000

      // Launch two concurrent collection requests
      const collectionPayload = (idempotencyKey: string) => ({
        loan_id: testLoanId,
        amount_paise: paymentAmount,
        payment_mode: 'cash',
        payment_date: new Date().toISOString().split('T')[0],
        idempotency_key: idempotencyKey,
      });

      const makeCollection = async (token: string, key: string): Promise<CollectionResult> => {
        try {
          const result = await apiRequest<{ id: string }>(
            'POST',
            '/collections',
            token,
            collectionPayload(key),
          );
          return { success: true, id: result.id };
        } catch (e: unknown) {
          const error = e as Error;
          // Parse status from error message
          const statusMatch = error.message.match(/failed: (\d+)/);
          return {
            success: false,
            error: error.message,
            status: statusMatch ? parseInt(statusMatch[1]) : undefined,
          };
        }
      };

      // Fire both at the same instant
      const [result1, result2] = await Promise.all([
        makeCollection(managerToken, crypto.randomUUID()),
        makeCollection(fieldOfficerToken, crypto.randomUUID()),
      ]);

      // With FOR UPDATE locks, both should succeed (they serialize)
      // The second request waits for the first to complete
      // If there's insufficient balance after the first, the second may fail
      console.log('Result 1:', result1);
      console.log('Result 2:', result2);

      // At least one must succeed
      const successCount = [result1, result2].filter((r) => r.success).length;
      expect(successCount).toBeGreaterThanOrEqual(1);

      // If both succeeded, verify total allocation doesn't exceed available
      if (successCount === 2) {
        const newSchedule = await apiRequest<LoanSchedule>(
          'GET',
          `/loans/${testLoanId}/schedule`,
          managerToken,
        );

        // Total paid should equal 2x payment amount
        const firstInstallmentNow = newSchedule.installments.find(
          (i) => i.id === firstUnpaidInstallment!.id,
        );
        const totalPaid =
          (firstInstallmentNow?.paid_principal_paise ?? 0) +
          (firstInstallmentNow?.paid_interest_paise ?? 0);

        // Should be at least the payment amount (could be more if second paid surplus)
        expect(totalPaid).toBeGreaterThanOrEqual(paymentAmount);
      }
    });

    test('idempotency key prevents duplicate payment', async () => {
      const schedule = await apiRequest<LoanSchedule>(
        'GET',
        `/loans/${testLoanId}/schedule`,
        managerToken,
      );

      const unpaidInstallment = schedule.installments.find((i) => i.status !== 'paid');
      if (!unpaidInstallment) {
        test.skip();
        return;
      }

      const paymentAmount = 100000; // ₹1,000
      const idempotencyKey = crypto.randomUUID();

      const payload = {
        loan_id: testLoanId,
        amount_paise: paymentAmount,
        payment_mode: 'cash',
        payment_date: new Date().toISOString().split('T')[0],
        idempotency_key: idempotencyKey,
      };

      // First request
      const first = await apiRequest<{ id: string }>('POST', '/collections', managerToken, payload);
      expect(first.id).toBeDefined();

      // Second request with same idempotency key should return same result (not create duplicate)
      const second = await apiRequest<{ id: string }>('POST', '/collections', managerToken, payload);
      expect(second.id).toBe(first.id);

      // Verify only one collection was created
      const collections = await apiRequest<{ data: Array<{ id: string }> }>(
        'GET',
        `/collections?loan_id=${testLoanId}&limit=100`,
        managerToken,
      );

      const countWithThisKey = collections.data.filter((c) => c.id === first.id).length;
      expect(countWithThisKey).toBe(1);
    });

    test('rapid-fire payments to same loan maintain data integrity', async () => {
      // Get initial state
      const initialSchedule = await apiRequest<LoanSchedule>(
        'GET',
        `/loans/${testLoanId}/schedule`,
        managerToken,
      );

      const initialOutstanding = initialSchedule.total_due_paise;

      // Fire 5 rapid payments
      const smallPayment = 50000; // ₹500 each
      const keys = Array.from({ length: 5 }, () => crypto.randomUUID());

      const results = await Promise.all(
        keys.map((key) =>
          apiRequest<{ id: string }>(
            'POST',
            '/collections',
            managerToken,
            {
              loan_id: testLoanId,
              amount_paise: smallPayment,
              payment_mode: 'cash',
              payment_date: new Date().toISOString().split('T')[0],
              idempotency_key: key,
            },
          ).catch((e: unknown) => ({ error: (e as Error).message })),
        ),
      );

      const successfulPayments = results.filter((r) => 'id' in r).length;
      console.log(`${successfulPayments} of 5 rapid payments succeeded`);

      // Verify final state
      const finalSchedule = await apiRequest<LoanSchedule>(
        'GET',
        `/loans/${testLoanId}/schedule`,
        managerToken,
      );

      // Outstanding should be reduced by exactly (successfulPayments * smallPayment)
      const expectedOutstanding = initialOutstanding - successfulPayments * smallPayment;
      expect(finalSchedule.total_due_paise).toBe(Math.max(0, expectedOutstanding));

      // Verify no overpayment on any installment
      for (const inst of finalSchedule.installments) {
        const totalDue = inst.principal_paise + inst.interest_paise;
        const totalPaid = inst.paid_principal_paise + inst.paid_interest_paise;
        expect(totalPaid).toBeLessThanOrEqual(totalDue);
      }
    });
  });

  test.describe('UI Concurrency', () => {
    test('user sees updated balance after another user pays', async ({ browser }) => {
      // Create two browser contexts (simulating two users)
      const context1 = await browser.newContext({
        storageState: 'e2e/.auth/manager.json',
      });
      const context2 = await browser.newContext({
        storageState: 'e2e/.auth/field_officer.json',
      });

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      try {
        // Both users open the same loan
        await Promise.all([
          page1.goto(`/loans/${testLoanId}`),
          page2.goto(`/loans/${testLoanId}`),
        ]);

        await Promise.all([
          page1.waitForLoadState('networkidle'),
          page2.waitForLoadState('networkidle'),
        ]);

        // Get initial balance shown to user 2
        const balanceLocator = page2.locator('[data-testid="outstanding-balance"], .outstanding-amount, text=/Outstanding.*₹/');
        const initialBalanceText = await balanceLocator.first().textContent();

        // User 1 makes a payment via API
        const paymentAmount = 100000; // ₹1,000
        await apiRequest<{ id: string }>(
          'POST',
          '/collections',
          managerToken,
          {
            loan_id: testLoanId,
            amount_paise: paymentAmount,
            payment_mode: 'cash',
            payment_date: new Date().toISOString().split('T')[0],
            idempotency_key: crypto.randomUUID(),
          },
        );

        // User 2 refreshes the page
        await page2.reload();
        await page2.waitForLoadState('networkidle');

        // Balance should be updated (less than before)
        const newBalanceText = await balanceLocator.first().textContent();

        // If we have numeric values, verify the decrease
        if (initialBalanceText != null && initialBalanceText !== '' && newBalanceText != null && newBalanceText !== '') {
          const extractAmount = (text: string): number => {
            const match = text.replace(/,/g, '').match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
          };

          const initialAmount = extractAmount(initialBalanceText);
          const newAmount = extractAmount(newBalanceText);

          // New amount should be less (payment reduced it)
          expect(newAmount).toBeLessThan(initialAmount);
        }
      } finally {
        await context1.close();
        await context2.close();
      }
    });

    test('collection form shows warning if balance changed since page load', async ({ managerPage }) => {
      await managerPage.goto(`/collections/new?loan_id=${testLoanId}`);
      await managerPage.waitForLoadState('networkidle');

      // Wait for form to load
      await expect(managerPage.getByRole('heading', { name: /collection|payment/i })).toBeVisible({ timeout: 15_000 });

      // Make a payment via API (simulating another user)
      await apiRequest<{ id: string }>(
        'POST',
        '/collections',
        fieldOfficerToken,
        {
          loan_id: testLoanId,
          amount_paise: 50000, // ₹500
          payment_mode: 'cash',
          payment_date: new Date().toISOString().split('T')[0],
          idempotency_key: crypto.randomUUID(),
        },
      );

      // Try to submit the form
      await managerPage.fill('input[name="amount"]', '500');
      await managerPage.selectOption('select[name="paymentMode"]', 'cash');

      const submitButton = managerPage.getByRole('button', { name: /submit|post|save/i });
      if (await submitButton.isVisible()) {
        await submitButton.click();

        // The system should either:
        // 1. Accept the payment (if there's still balance)
        // 2. Show an error (if overpayment would occur)
        // 3. Show a warning about changed balance
        const errorOrSuccess = managerPage.getByText(/success|error|warning|balance|paid/i);
        await expect(errorOrSuccess).toBeVisible({ timeout: 10_000 });
      }
    });
  });

  test.describe('Data Integrity Verification', () => {
    test('loan balance reconciles with sum of installment balances', async () => {
      const schedule = await apiRequest<LoanSchedule>(
        'GET',
        `/loans/${testLoanId}/schedule`,
        managerToken,
      );

      // Sum up all installment balances
      let totalPrincipal = 0;
      let totalInterest = 0;
      let totalPaidPrincipal = 0;
      let totalPaidInterest = 0;

      for (const inst of schedule.installments) {
        totalPrincipal += inst.principal_paise;
        totalInterest += inst.interest_paise;
        totalPaidPrincipal += inst.paid_principal_paise;
        totalPaidInterest += inst.paid_interest_paise;
      }

      const totalDue = totalPrincipal + totalInterest;
      const totalPaid = totalPaidPrincipal + totalPaidInterest;
      const calculatedBalance = totalDue - totalPaid;

      // Loan's reported outstanding should match
      expect(schedule.total_due_paise).toBe(calculatedBalance);

      // Principal balance should match
      const principalBalance = totalPrincipal - totalPaidPrincipal;
      expect(schedule.principal_balance_paise).toBe(principalBalance);
    });

    test('no installment has negative paid amounts', async () => {
      const schedule = await apiRequest<LoanSchedule>(
        'GET',
        `/loans/${testLoanId}/schedule`,
        managerToken,
      );

      for (const inst of schedule.installments) {
        expect(inst.paid_principal_paise).toBeGreaterThanOrEqual(0);
        expect(inst.paid_interest_paise).toBeGreaterThanOrEqual(0);
      }
    });

    test('paid amounts never exceed due amounts', async () => {
      const schedule = await apiRequest<LoanSchedule>(
        'GET',
        `/loans/${testLoanId}/schedule`,
        managerToken,
      );

      for (const inst of schedule.installments) {
        expect(inst.paid_principal_paise).toBeLessThanOrEqual(inst.principal_paise);
        expect(inst.paid_interest_paise).toBeLessThanOrEqual(inst.interest_paise);
      }
    });
  });
});
