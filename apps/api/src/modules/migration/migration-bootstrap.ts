import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

/**
 * Idempotent bootstrap of the three "fixture" rows that every migrated record
 * points at. Run inside the same Prisma transaction as the migration commit so
 * the bootstrap rolls back if the migration fails.
 *
 * Creates if missing — otherwise returns the existing ids:
 *  - `migration-bot` user (super_admin, is_active=false). Used as created_by /
 *    collected_by on all migrated rows. Auditors filter on it cleanly.
 *  - `LEGACY_MIGRATION` loan product + version 1, with zero penalty rules.
 *    Migrated loans point at this product_version_id so future penalty/interest
 *    logic doesn't retroactively apply real-product terms to legacy balances.
 *  - One shared `journal_entries` row (zero totals, no journal_lines). Every
 *    migrated `collections.journal_entry_id` / `disbursements.journal_entry_id`
 *    / `penalties.journal_entry_id` points at this row. Because reports filter
 *    on `journal_lines.account_id`, a JE with no lines is invisible to P&L /
 *    cash reports — i.e. zero ledger impact.
 */

const MIGRATION_BOT_USERNAME = 'migration-bot';
const LEGACY_PRODUCT_NAME = 'LEGACY_MIGRATION';
// Shared mobile + email — these can't collide with real users because the
// account is is_active=false so login won't ever try to match them.
const MIGRATION_BOT_MOBILE = '0000000000';
const MIGRATION_BOT_EMAIL = 'migration@asfinance.internal';

export type MigrationFixtures = {
  migrationBotUserId: string;
  legacyProductVersionId: string;
  sharedJournalEntryId: string;
};

// Prisma transaction client type (loose — exact shape varies by Prisma version).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TxClient = any;

export async function ensureMigrationFixtures(tx: TxClient, now: Date): Promise<MigrationFixtures> {
  // 1. migration-bot user
  let bot = await tx.users.findUnique({ where: { username: MIGRATION_BOT_USERNAME } });
  if (!bot) {
    const passwordHash = await bcrypt.hash(randomUUID(), 10); // unguessable; account is inactive anyway
    bot = await tx.users.create({
      data: {
        username: MIGRATION_BOT_USERNAME,
        password_hash: passwordHash,
        full_name: 'Data Migration (system)',
        email: MIGRATION_BOT_EMAIL,
        mobile: MIGRATION_BOT_MOBILE,
        role: 'super_admin',
        is_active: false,
      },
    });
  }

  // 2. LEGACY_MIGRATION product + version
  let product = await tx.loan_products.findUnique({ where: { name: LEGACY_PRODUCT_NAME } });
  if (!product) {
    product = await tx.loan_products.create({
      data: {
        name: LEGACY_PRODUCT_NAME,
        is_active: false, // hidden from the New Loan dropdown
        created_by: bot.id,
      },
    });
  }
  // Find or create version 1 (penalty/interest rules are all zero — these loans
  // are snapshots; the system shouldn't accrue new interest or penalty against them).
  let version = await tx.loan_product_versions.findFirst({
    where: { product_id: product.id, version_number: 1 },
  });
  if (!version) {
    version = await tx.loan_product_versions.create({
      data: {
        product_id: product.id,
        version_number: 1,
        interest_type: 'reducing_balance',
        annual_rate_bps: 0,
        min_principal_paise: 1n,
        max_principal_paise: BigInt('9999999999999'),
        min_tenure_months: 1,
        max_tenure_months: 600,
        repayment_frequency: 'monthly',
        penalty_grace_days: 0,
        max_concurrent_loans: 999,
        is_active: false,
      },
    });
    await tx.loan_products.update({
      where: { id: product.id },
      data: { current_version_id: version.id },
    });
  }

  // 3. Shared zero-totals journal entry
  // We mark source_type='disbursement' (any enum value works — the field is
  // mostly informational) and source_id pointing at the product itself so it's
  // discoverable. The KEY safety property: no journal_lines are written, so the
  // entry is invisible to P&L / Trial Balance / Cashbook.
  let je = await tx.journal_entries.findFirst({
    where: {
      source_type: 'disbursement',
      source_id: product.id, // sentinel — never used for a real disbursement
      total_debit_paise: 0n,
      total_credit_paise: 0n,
    },
  });
  if (!je) {
    je = await tx.journal_entries.create({
      data: {
        entry_date: now,
        description: 'LEGACY_MIGRATION shared journal entry — zero impact, points all migrated rows here',
        source_type: 'disbursement',
        source_id: product.id,
        total_debit_paise: 0n,
        total_credit_paise: 0n,
        created_by: bot.id,
      },
    });
  }

  return {
    migrationBotUserId: bot.id,
    legacyProductVersionId: version.id,
    sharedJournalEntryId: je.id,
  };
}
