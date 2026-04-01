/**
 * Post-Run Verification Script — Collection Load Test
 *
 * Node.js/TypeScript script that runs after the k6 collection load test.
 * Parses the k6 JSON summary and verifies:
 *   1. Idempotency: one collection record per unique idempotency key
 *   2. Allocation preservation: for each collection, sum of allocation
 *      components (penalty + interest + principal) equals the posted amount
 *
 * Usage:
 *   npx tsx apps/api/test/load/verify-collection-load.ts [results-path]
 *
 * Feature: expanded-test-automation
 * Validates: Requirements 2.3, 2.4
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

// ─── Types ───────────────────────────────────────────────────────────────────

interface K6MetricValues {
  avg?: number;
  min?: number;
  max?: number;
  med?: number;
  'p(90)'?: number;
  'p(95)'?: number;
  'p(99)'?: number;
  count?: number;
  rate?: number;
  passes?: number;
  fails?: number;
}

interface K6Metric {
  type: string;
  contains: string;
  values: K6MetricValues;
  thresholds?: Record<string, boolean>;
}

interface K6Summary {
  metrics: Record<string, K6Metric>;
  root_group?: unknown;
}

interface VerificationResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    details: string;
  }[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_RESULTS_PATH = path.join(__dirname, 'results.json');
const K6_IDEMPOTENCY_PREFIX = 'k6-coll-';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadK6Summary(resultsPath: string): K6Summary {
  if (!fs.existsSync(resultsPath)) {
    throw new Error(`k6 results file not found at: ${resultsPath}`);
  }

  const raw = fs.readFileSync(resultsPath, 'utf-8');
  return JSON.parse(raw) as K6Summary;
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  return new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
}

// ─── Verification Checks ────────────────────────────────────────────────────

/**
 * Check 1: Parse k6 summary and report threshold results.
 */
function verifyK6Thresholds(summary: K6Summary): {
  passed: boolean;
  details: string;
} {
  const thresholdResults: string[] = [];
  let allPassed = true;

  for (const [metricName, metric] of Object.entries(summary.metrics)) {
    if (metric.thresholds) {
      for (const [threshold, ok] of Object.entries(metric.thresholds)) {
        const status = ok ? '✓' : '✗';
        thresholdResults.push(`  ${status} ${metricName}: ${threshold} → ${ok ? 'PASS' : 'FAIL'}`);
        if (!ok) allPassed = false;
      }
    }
  }

  // Also report key metrics
  const durationMetric =
    summary.metrics['http_req_duration{endpoint:collection}'] ||
    summary.metrics['http_req_duration'];
  if (durationMetric?.values) {
    const p95 = durationMetric.values['p(95)'];
    thresholdResults.push(`  P95 latency: ${p95?.toFixed(2) ?? 'N/A'}ms`);
  }

  const reqsMetric = summary.metrics['http_reqs'];
  if (reqsMetric?.values) {
    thresholdResults.push(`  Total requests: ${reqsMetric.values.count ?? 'N/A'}`);
    thresholdResults.push(`  Throughput: ${reqsMetric.values.rate?.toFixed(2) ?? 'N/A'} req/s`);
  }

  return {
    passed: allPassed,
    details: thresholdResults.join('\n'),
  };
}

/**
 * Check 2: Idempotency — one collection record per unique idempotency key.
 *
 * Queries the database for all collections created by the k6 load test
 * (identified by the k6-coll- prefix on idempotency keys) and verifies
 * that no idempotency key has more than one collection record.
 */
async function verifyIdempotency(prisma: PrismaClient): Promise<{
  passed: boolean;
  details: string;
}> {
  // Find all collections with k6 load test idempotency keys
  const collections = await prisma.collections.findMany({
    where: {
      idempotency_key: { startsWith: K6_IDEMPOTENCY_PREFIX },
    },
    select: {
      id: true,
      idempotency_key: true,
    },
  });

  if (collections.length === 0) {
    return {
      passed: true,
      details: 'No k6 load test collections found in database (test may not have created any)',
    };
  }

  // Group by idempotency key and check for duplicates
  const keyMap = new Map<string, string[]>();
  for (const coll of collections) {
    const existing = keyMap.get(coll.idempotency_key) || [];
    existing.push(coll.id);
    keyMap.set(coll.idempotency_key, existing);
  }

  const duplicates = Array.from(keyMap.entries()).filter(
    ([, ids]) => ids.length > 1,
  );

  const totalKeys = keyMap.size;
  const totalRecords = collections.length;

  if (duplicates.length > 0) {
    const dupDetails = duplicates
      .slice(0, 5) // Show at most 5 examples
      .map(([key, ids]) => `    key="${key}" → ${ids.length} records (IDs: ${ids.join(', ')})`)
      .join('\n');

    return {
      passed: false,
      details: [
        `FAIL: ${duplicates.length} idempotency key(s) have duplicate records`,
        `  Total unique keys: ${totalKeys}`,
        `  Total collection records: ${totalRecords}`,
        `  Duplicate examples:`,
        dupDetails,
      ].join('\n'),
    };
  }

  return {
    passed: true,
    details: [
      `PASS: All idempotency keys map to exactly one collection record`,
      `  Total unique keys: ${totalKeys}`,
      `  Total collection records: ${totalRecords}`,
    ].join('\n'),
  };
}

/**
 * Check 3: Allocation preservation invariant.
 *
 * For each successful collection from the load test, verifies that:
 *   sum(penalty_paise + interest_paise + principal_paise) across all allocations
 *   == collection.amount_paise
 */
async function verifyAllocationPreservation(prisma: PrismaClient): Promise<{
  passed: boolean;
  details: string;
}> {
  // Find all posted (non-reversed) collections from the k6 load test
  const collections = await prisma.collections.findMany({
    where: {
      idempotency_key: { startsWith: K6_IDEMPOTENCY_PREFIX },
      status: 'posted',
    },
    select: {
      id: true,
      amount_paise: true,
      idempotency_key: true,
    },
  });

  if (collections.length === 0) {
    return {
      passed: true,
      details: 'No posted k6 load test collections found — nothing to verify',
    };
  }

  const violations: string[] = [];
  let checkedCount = 0;

  for (const coll of collections) {
    // Sum allocation components for this collection
    const allocations = await prisma.collection_allocations.aggregate({
      where: { collection_id: coll.id },
      _sum: {
        penalty_paise: true,
        interest_paise: true,
        principal_paise: true,
      },
    });

    const penaltySum = allocations._sum.penalty_paise ?? BigInt(0);
    const interestSum = allocations._sum.interest_paise ?? BigInt(0);
    const principalSum = allocations._sum.principal_paise ?? BigInt(0);
    const allocationTotal = penaltySum + interestSum + principalSum;

    if (allocationTotal !== coll.amount_paise) {
      violations.push(
        `    collection=${coll.id} key="${coll.idempotency_key}": ` +
          `amount=${coll.amount_paise}, allocations=${allocationTotal} ` +
          `(penalty=${penaltySum}, interest=${interestSum}, principal=${principalSum})`,
      );
    }

    checkedCount++;
  }

  if (violations.length > 0) {
    const shown = violations.slice(0, 5);
    return {
      passed: false,
      details: [
        `FAIL: ${violations.length} collection(s) have allocation sum ≠ posted amount`,
        `  Checked: ${checkedCount} collections`,
        `  Violations:`,
        ...shown,
        violations.length > 5 ? `    ... and ${violations.length - 5} more` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  return {
    passed: true,
    details: [
      `PASS: All allocation sums equal posted amounts`,
      `  Checked: ${checkedCount} collections`,
    ].join('\n'),
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const resultsPath = process.argv[2] || DEFAULT_RESULTS_PATH;

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Collection Load Test — Post-Run Verification           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  const result: VerificationResult = { passed: true, checks: [] };

  // ── Check 1: k6 Threshold Results ──────────────────────────────────────

  console.log('1. k6 Threshold Results');
  console.log('─'.repeat(50));

  try {
    const summary = loadK6Summary(resultsPath);
    const thresholdCheck = verifyK6Thresholds(summary);
    result.checks.push({
      name: 'k6 Thresholds',
      passed: thresholdCheck.passed,
      details: thresholdCheck.details,
    });
    if (!thresholdCheck.passed) result.passed = false;
    console.log(thresholdCheck.details);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.checks.push({
      name: 'k6 Thresholds',
      passed: false,
      details: `ERROR: ${message}`,
    });
    result.passed = false;
    console.log(`  ✗ ERROR: ${message}`);
  }
  console.log();

  // ── Check 2 & 3: Database Invariants ───────────────────────────────────

  let prisma: PrismaClient | null = null;

  try {
    prisma = createPrismaClient();
    await prisma.$connect();

    // Check 2: Idempotency
    console.log('2. Idempotency Invariant (one record per key)');
    console.log('─'.repeat(50));

    const idempotencyCheck = await verifyIdempotency(prisma);
    result.checks.push({
      name: 'Idempotency',
      passed: idempotencyCheck.passed,
      details: idempotencyCheck.details,
    });
    if (!idempotencyCheck.passed) result.passed = false;
    console.log(idempotencyCheck.details);
    console.log();

    // Check 3: Allocation Preservation
    console.log('3. Allocation Preservation Invariant');
    console.log('─'.repeat(50));

    const allocationCheck = await verifyAllocationPreservation(prisma);
    result.checks.push({
      name: 'Allocation Preservation',
      passed: allocationCheck.passed,
      details: allocationCheck.details,
    });
    if (!allocationCheck.passed) result.passed = false;
    console.log(allocationCheck.details);
    console.log();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    result.checks.push({
      name: 'Database Verification',
      passed: false,
      details: `ERROR: ${message}`,
    });
    result.passed = false;
    console.log(`  ✗ Database verification error: ${message}`);
    console.log();
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────

  console.log('═'.repeat(50));
  console.log(
    result.passed
      ? '✅ ALL VERIFICATION CHECKS PASSED'
      : '❌ SOME VERIFICATION CHECKS FAILED',
  );
  console.log('═'.repeat(50));

  // Exit with non-zero code on failure
  if (!result.passed) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
