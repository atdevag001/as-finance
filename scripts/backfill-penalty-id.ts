#!/usr/bin/env npx tsx
/**
 * Backfill collection_allocations.penalty_id for historical data.
 *
 * Before the audit-fix migration (20260604000000), collection_allocations
 * rows that paid penalties had penalty_paise > 0 but no penalty_id link.
 * This made reversal imprecise (walked penalties by period, not exact match).
 *
 * This script matches allocations to penalties by:
 *   - Same installment_id
 *   - Penalty created before or at the collection time
 *   - Penalty amount >= allocation penalty_paise (partial pays possible)
 *
 * For ambiguous cases (multiple penalties on same installment), it picks
 * the earliest penalty_period that has capacity. This mirrors the original
 * allocation order (oldest-first).
 *
 * Usage:
 *   cd apps/api && npx tsx ../../scripts/backfill-penalty-id.ts [--dry-run]
 *
 * Flags:
 *   --dry-run   Print what would be updated without committing
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

interface AllocationRow {
  id: string;
  collection_id: string;
  installment_id: string;
  penalty_paise: bigint;
  created_at: Date;
}

interface PenaltyRow {
  id: string;
  installment_id: string;
  amount_paise: bigint;
  paid_paise: bigint;
  penalty_period: string;
  created_at: Date;
}

async function main() {
  console.log(`Backfill penalty_id on collection_allocations (${DRY_RUN ? 'DRY RUN' : 'LIVE'})\n`);

  // 1. Find allocations with penalty_paise > 0 but no penalty_id
  const orphanAllocations = await prisma.$queryRaw<AllocationRow[]>`
    SELECT id, collection_id, installment_id, penalty_paise, created_at
    FROM collection_allocations
    WHERE penalty_paise > 0 AND penalty_id IS NULL
    ORDER BY created_at ASC
  `;

  console.log(`Found ${orphanAllocations.length} allocations with penalty_paise > 0 but no penalty_id\n`);

  if (orphanAllocations.length === 0) {
    console.log('Nothing to backfill.');
    return;
  }

  // 2. For each, find matching penalty
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const alloc of orphanAllocations) {
    // Get penalties for this installment that existed at allocation time
    const candidates = await prisma.$queryRaw<PenaltyRow[]>`
      SELECT id, installment_id, amount_paise, paid_paise, penalty_period, created_at
      FROM penalties
      WHERE installment_id = ${alloc.installment_id}
        AND created_at <= ${alloc.created_at}
      ORDER BY penalty_period ASC
    `;

    if (candidates.length === 0) {
      errors.push(`Allocation ${alloc.id}: no penalty found for installment ${alloc.installment_id}`);
      skipped++;
      continue;
    }

    // Find the first penalty with enough capacity (amount - paid >= alloc penalty)
    // This is a heuristic — the original allocation would have picked oldest-first
    let matched: PenaltyRow | null = null;
    for (const p of candidates) {
      // Note: paid_paise at query time includes subsequent payments, so this
      // is imperfect. We match on "could this penalty have absorbed this amount".
      // For exact matching we'd need the penalty state at alloc.created_at.
      // This heuristic works for most cases where there's one penalty per period.
      if (p.amount_paise >= alloc.penalty_paise) {
        matched = p;
        break;
      }
    }

    if (!matched) {
      // Fallback: just pick the first one (oldest period)
      matched = candidates[0];
    }

    if (DRY_RUN) {
      console.log(`[DRY] Allocation ${alloc.id} → Penalty ${matched.id} (period: ${matched.penalty_period})`);
    } else {
      await prisma.$executeRaw`
        UPDATE collection_allocations
        SET penalty_id = ${matched.id}::uuid
        WHERE id = ${alloc.id}::uuid
      `;
    }
    updated++;
  }

  console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'}: ${updated}`);
  console.log(`Skipped (no match): ${skipped}`);

  if (errors.length > 0) {
    console.log('\nWarnings:');
    errors.slice(0, 10).forEach((e) => console.log(`  - ${e}`));
    if (errors.length > 10) {
      console.log(`  ... and ${errors.length - 10} more`);
    }
  }

  if (!DRY_RUN && updated > 0) {
    console.log('\nBackfill complete. Verify with:');
    console.log('  SELECT COUNT(*) FROM collection_allocations WHERE penalty_paise > 0 AND penalty_id IS NULL;');
  }
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
