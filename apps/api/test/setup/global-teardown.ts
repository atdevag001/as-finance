/**
 * Vitest globalTeardown — runs once after all E2E test suites complete.
 *
 * Responsibilities:
 *  1. Clean up all test data created during the E2E run (e2e_ / test_ prefixed)
 *  2. Disconnect the Prisma client
 *
 * Deletion order respects foreign key constraints — child tables first.
 */

import { PrismaClient } from '@prisma/client';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Prefixes used by E2E seed data and test factories */
const TEST_USERNAME_PREFIXES = ['e2e_', 'test_'];
const TEST_PRODUCT_PREFIXES = ['E2E ', 'Test '];

// ─── Cleanup Helpers ─────────────────────────────────────────────────────────

/**
 * Collect IDs of all E2E-seeded users (usernames starting with known prefixes).
 */
async function getTestUserIds(prisma: PrismaClient): Promise<string[]> {
  const users = await prisma.users.findMany({
    where: {
      OR: TEST_USERNAME_PREFIXES.map((prefix) => ({
        username: { startsWith: prefix },
      })),
    },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Collect IDs of all E2E-seeded loan products.
 */
async function getTestProductIds(prisma: PrismaClient): Promise<string[]> {
  const products = await prisma.loan_products.findMany({
    where: {
      OR: TEST_PRODUCT_PREFIXES.map((prefix) => ({
        name: { startsWith: prefix },
      })),
    },
    select: { id: true },
  });
  return products.map((p) => p.id);
}

/**
 * Delete all test data in FK-safe order.
 *
 * Strategy: use raw SQL with cascading deletes in the correct dependency order.
 * We identify test data by the e2e_/test_ user who created it, plus product name prefixes.
 */
async function cleanupTestData(prisma: PrismaClient): Promise<void> {
  const userIds = await getTestUserIds(prisma);
  if (userIds.length === 0) {
    console.log('  ⚠ No test users found — skipping data cleanup');
    return;
  }

  // Get loan IDs created by test users
  const testLoans = await prisma.loans.findMany({
    where: { created_by: { in: userIds } },
    select: { id: true },
  });
  const loanIds = testLoans.map((l) => l.id);

  // Get customer IDs created by test users
  const testCustomers = await prisma.customers.findMany({
    where: { created_by: { in: userIds } },
    select: { id: true },
  });
  const customerIds = testCustomers.map((c) => c.id);

  // Get group IDs created by test users
  const testGroups = await prisma.groups.findMany({
    where: { created_by: { in: userIds } },
    select: { id: true },
  });
  const groupIds = testGroups.map((g) => g.id);

  // Get product IDs by name prefix
  const productIds = await getTestProductIds(prisma);

  // ── Delete in FK-safe order (leaf tables first) ──

  // 1. Audit logs (references users only, safe to delete early)
  if (userIds.length > 0) {
    await prisma.audit_logs.deleteMany({ where: { actor_id: { in: userIds } } });
  }

  // 2. Outbox messages (no FK children)
  if (loanIds.length > 0) {
    await prisma.outbox_messages.deleteMany({
      where: { source_id: { in: loanIds } },
    });
  }

  // 3. Idempotency keys created during test window (clean all — they expire anyway)
  await prisma.idempotency_keys.deleteMany({
    where: {
      OR: [
        { key: { startsWith: 'e2e_' } },
        { key: { startsWith: 'test_' } },
      ],
    },
  });

  // 4. Cash handover records (references users)
  if (userIds.length > 0) {
    await prisma.cash_handover_records.deleteMany({
      where: {
        OR: [
          { collection_officer_id: { in: userIds } },
          { receiving_officer_id: { in: userIds } },
        ],
      },
    });
  }

  // 5. Cash transactions (references users)
  if (userIds.length > 0) {
    await prisma.cash_transactions.deleteMany({
      where: { recorded_by: { in: userIds } },
    });
  }

  // 6. Overdue entries (references loans, schedules)
  if (loanIds.length > 0) {
    await prisma.overdue_entries.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 7. Foreclosures (references loans, collections, users)
  if (loanIds.length > 0) {
    await prisma.foreclosures.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 8. Penalties (references loans, schedules, journal_entries)
  if (loanIds.length > 0) {
    await prisma.penalties.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 9. Collection allocations (references collections, schedules)
  if (loanIds.length > 0) {
    const testCollections = await prisma.collections.findMany({
      where: { loan_id: { in: loanIds } },
      select: { id: true },
    });
    const collectionIds = testCollections.map((c) => c.id);
    if (collectionIds.length > 0) {
      await prisma.collection_allocations.deleteMany({
        where: { collection_id: { in: collectionIds } },
      });
    }
  }

  // 10. Receipts (references collections, loans, customers — self-referential)
  if (loanIds.length > 0) {
    // Clear self-referential FKs first
    await prisma.receipts.updateMany({
      where: { loan_id: { in: loanIds } },
      data: { compensating_receipt_id: null, original_receipt_id: null },
    });
    await prisma.receipts.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 11. Collections (references loans — self-referential via original_collection_id)
  if (loanIds.length > 0) {
    // Clear self-referential FK first
    await prisma.collections.updateMany({
      where: { loan_id: { in: loanIds } },
      data: { original_collection_id: null },
    });
    await prisma.collections.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 12. Expenses (references journal_entries, users, file_metadata)
  if (userIds.length > 0) {
    await prisma.expenses.deleteMany({ where: { recorded_by: { in: userIds } } });
  }

  // 13. Journal lines (references journal_entries, chart_of_accounts)
  if (userIds.length > 0) {
    const testJournals = await prisma.journal_entries.findMany({
      where: { created_by: { in: userIds } },
      select: { id: true },
    });
    const journalIds = testJournals.map((j) => j.id);
    if (journalIds.length > 0) {
      await prisma.journal_lines.deleteMany({
        where: { journal_entry_id: { in: journalIds } },
      });
    }
  }

  // 14. Disbursements (references loans, journal_entries, users)
  if (loanIds.length > 0) {
    await prisma.disbursements.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 15. Journal entries (references users — now safe after lines, disbursements, collections, expenses, penalties removed)
  if (userIds.length > 0) {
    await prisma.journal_entries.deleteMany({ where: { created_by: { in: userIds } } });
  }

  // 16. Loan schedules (references loans)
  if (loanIds.length > 0) {
    await prisma.loan_schedules.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 17. Loan status history (references loans, users)
  if (loanIds.length > 0) {
    await prisma.loan_status_history.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 18. Loan approvals (references loans, users)
  if (loanIds.length > 0) {
    await prisma.loan_approvals.deleteMany({ where: { loan_id: { in: loanIds } } });
  }

  // 19. Group collections (references groups, users)
  if (groupIds.length > 0) {
    await prisma.group_collections.deleteMany({ where: { group_id: { in: groupIds } } });
  }

  // 20. Group members (references groups, customers)
  if (groupIds.length > 0) {
    await prisma.group_members.deleteMany({ where: { group_id: { in: groupIds } } });
  }

  // 21. Loans (references customers, product_versions, groups, users)
  if (loanIds.length > 0) {
    await prisma.loans.deleteMany({ where: { id: { in: loanIds } } });
  }

  // 22. Groups (references customers, users)
  if (groupIds.length > 0) {
    await prisma.groups.deleteMany({ where: { id: { in: groupIds } } });
  }

  // 23. Customer documents (references customers, file_metadata, users)
  if (customerIds.length > 0) {
    await prisma.customer_documents.deleteMany({ where: { customer_id: { in: customerIds } } });
  }

  // 24. Family members (references customers)
  if (customerIds.length > 0) {
    await prisma.family_members.deleteMany({ where: { customer_id: { in: customerIds } } });
  }

  // 25. Guarantors (references customers, file_metadata)
  if (customerIds.length > 0) {
    await prisma.guarantors.deleteMany({ where: { customer_id: { in: customerIds } } });
  }

  // 26. Customers (references users, file_metadata)
  if (customerIds.length > 0) {
    await prisma.customers.deleteMany({ where: { id: { in: customerIds } } });
  }

  // 27. File metadata (references users)
  if (userIds.length > 0) {
    await prisma.file_metadata.deleteMany({ where: { uploaded_by: { in: userIds } } });
  }

  // 28. Loan product versions (references loan_products)
  // First clear the current_version_id FK on loan_products
  if (productIds.length > 0) {
    await prisma.loan_products.updateMany({
      where: { id: { in: productIds } },
      data: { current_version_id: null },
    });
    await prisma.loan_product_versions.deleteMany({ where: { product_id: { in: productIds } } });
  }

  // 29. Loan products (references users)
  if (productIds.length > 0) {
    await prisma.loan_products.deleteMany({ where: { id: { in: productIds } } });
  }

  // 30. Refresh tokens (references users)
  if (userIds.length > 0) {
    await prisma.refresh_tokens.deleteMany({ where: { user_id: { in: userIds } } });
  }

  // 31. User area assignments (references users)
  if (userIds.length > 0) {
    await prisma.user_area_assignments.deleteMany({
      where: {
        OR: [
          { user_id: { in: userIds } },
          { assigned_by: { in: userIds } },
        ],
      },
    });
  }

  // 32. Users (leaf — all dependents removed above)
  if (userIds.length > 0) {
    await prisma.users.deleteMany({ where: { id: { in: userIds } } });
  }

  // 33. Clean up test settings (seeded by global-setup)
  await prisma.settings.deleteMany({
    where: {
      key: {
        in: [
          'holiday_calendar',
          'default_penalty_grace_days',
          'max_page_size',
          'max_annual_rate_bps',
          'min_annual_rate_bps',
          'max_group_size',
          'min_group_size',
        ],
      },
    },
  });

  console.log(
    `  ✓ Cleaned up: ${userIds.length} users, ${customerIds.length} customers, ` +
    `${loanIds.length} loans, ${productIds.length} products, ${groupIds.length} groups`,
  );
}

// ─── Main Teardown ───────────────────────────────────────────────────────────

export async function teardown(): Promise<void> {
  console.log('\n🧹 E2E Global Teardown starting...\n');

  const prisma = (globalThis as Record<string, unknown>)['__PRISMA_CLIENT__'] as PrismaClient | undefined;

  if (!prisma) {
    console.log('  ⚠ No Prisma client found on globalThis — skipping cleanup');
    return;
  }

  try {
    await cleanupTestData(prisma);
  } catch (err) {
    console.error('  ✗ Test data cleanup failed:', err);
    // Don't throw — still disconnect below
  }

  try {
    await prisma.$disconnect();
    console.log('  ✓ Prisma client disconnected');
  } catch (err) {
    console.error('  ✗ Prisma disconnect failed:', err);
  }

  // Clear globalThis references
  delete (globalThis as Record<string, unknown>)['__PRISMA_CLIENT__'];
  delete (globalThis as Record<string, unknown>)['__SEED_DATA__'];
  delete (globalThis as Record<string, unknown>)['__API_BASE_URL__'];

  // Clean up temp seed data file
  try {
    const fs = await import('fs');
    const path = await import('path');
    const seedFilePath = path.join(__dirname, '.seed-data.json');
    if (fs.existsSync(seedFilePath)) {
      fs.unlinkSync(seedFilePath);
    }
  } catch {
    // Ignore cleanup errors
  }

  console.log('\n✅ E2E Global Teardown complete\n');
}
