/**
 * Database Utilities for E2E Tests
 *
 * Direct Prisma client for verification queries that bypass the API layer.
 * Used to assert database state after API operations.
 *
 * The PrismaClient instance is retrieved from globalThis.__PRISMA_CLIENT__
 * (set during global setup) or can be passed in directly.
 */

import { PrismaClient } from '@prisma/client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DbUtils {
  prisma: PrismaClient;

  // Entity finders
  findCustomerById(id: string): Promise<Awaited<ReturnType<PrismaClient['customers']['findUnique']>>>;
  findLoanById(id: string): Promise<Awaited<ReturnType<PrismaClient['loans']['findUnique']>>>;
  findSchedulesByLoanId(loanId: string): Promise<Awaited<ReturnType<PrismaClient['loan_schedules']['findMany']>>>;
  findCollectionsByLoanId(loanId: string): Promise<Awaited<ReturnType<PrismaClient['collections']['findMany']>>>;
  findJournalEntryById(id: string): Promise<Awaited<ReturnType<PrismaClient['journal_entries']['findUnique']>>>;
  findJournalLinesByEntryId(entryId: string): Promise<Awaited<ReturnType<PrismaClient['journal_lines']['findMany']>>>;
  findAuditLogsByTarget(entityType: string, entityId: string): Promise<Awaited<ReturnType<PrismaClient['audit_logs']['findMany']>>>;
  findReceiptByCollectionId(collectionId: string): Promise<Awaited<ReturnType<PrismaClient['receipts']['findFirst']>>>;
  findPenaltiesByLoanId(loanId: string): Promise<Awaited<ReturnType<PrismaClient['penalties']['findMany']>>>;
  findOutboxMessagesBySource(sourceType: string, sourceId: string): Promise<Awaited<ReturnType<PrismaClient['outbox_messages']['findMany']>>>;
  findUserById(id: string): Promise<Awaited<ReturnType<PrismaClient['users']['findUnique']>>>;
  findRefreshTokensByUserId(userId: string): Promise<Awaited<ReturnType<PrismaClient['refresh_tokens']['findMany']>>>;
  findSettingByKey(key: string): Promise<Awaited<ReturnType<PrismaClient['settings']['findUnique']>>>;
  findFamilyMembersByCustomerId(customerId: string): Promise<Awaited<ReturnType<PrismaClient['family_members']['findMany']>>>;
  findGuarantorsByCustomerId(customerId: string): Promise<Awaited<ReturnType<PrismaClient['guarantors']['findMany']>>>;

  // Aggregate queries
  sumAllocationsForCollection(collectionId: string): Promise<{ penalty: bigint; interest: bigint; principal: bigint }>;
  getLoanOutstanding(loanId: string): Promise<bigint>;
  getTrialBalanceTotals(): Promise<{ totalDebits: bigint; totalCredits: bigint }>;
  getCashbookBalance(date: string): Promise<{ opening: bigint; inflows: bigint; outflows: bigint; closing: bigint }>;
  countReceiptsForLoan(loanId: string): Promise<number>;
  getReceiptNumberRange(loanId: string): Promise<{ min: string; max: string }>;

  // Cleanup
  cleanupTestData(prefix: string): Promise<void>;
}

// ─── Implementation ──────────────────────────────────────────────────────────


/**
 * Create a DbUtils instance.
 *
 * @param prismaOrUndefined - Optional PrismaClient. Falls back to globalThis.__PRISMA_CLIENT__.
 */
export function createDbUtils(prismaOrUndefined?: PrismaClient): DbUtils {
  const prisma =
    prismaOrUndefined ??
    ((globalThis as Record<string, unknown>)['__PRISMA_CLIENT__'] as PrismaClient);

  if (!prisma) {
    throw new Error(
      'No PrismaClient available. Ensure global setup has run or pass a PrismaClient explicitly.',
    );
  }

  return {
    prisma,

    // ── Entity Finders ─────────────────────────────────────────────────────

    async findCustomerById(id: string) {
      return prisma.customers.findUnique({ where: { id } });
    },

    async findLoanById(id: string) {
      return prisma.loans.findUnique({ where: { id } });
    },

    async findSchedulesByLoanId(loanId: string) {
      return prisma.loan_schedules.findMany({
        where: { loan_id: loanId },
        orderBy: { installment_number: 'asc' },
      });
    },

    async findCollectionsByLoanId(loanId: string) {
      return prisma.collections.findMany({
        where: { loan_id: loanId },
        orderBy: { created_at: 'asc' },
      });
    },

    async findJournalEntryById(id: string) {
      return prisma.journal_entries.findUnique({ where: { id } });
    },

    async findJournalLinesByEntryId(entryId: string) {
      return prisma.journal_lines.findMany({
        where: { journal_entry_id: entryId },
        orderBy: { created_at: 'asc' },
      });
    },

    async findAuditLogsByTarget(entityType: string, entityId: string) {
      return prisma.audit_logs.findMany({
        where: { target_entity: entityType, target_id: entityId },
        orderBy: { created_at: 'asc' },
      });
    },

    async findReceiptByCollectionId(collectionId: string) {
      return prisma.receipts.findFirst({
        where: { collection_id: collectionId },
      });
    },

    async findPenaltiesByLoanId(loanId: string) {
      return prisma.penalties.findMany({
        where: { loan_id: loanId },
        orderBy: { created_at: 'asc' },
      });
    },

    async findOutboxMessagesBySource(sourceType: string, sourceId: string) {
      return prisma.outbox_messages.findMany({
        where: { source_type: sourceType, source_id: sourceId },
        orderBy: { created_at: 'asc' },
      });
    },

    async findUserById(id: string) {
      return prisma.users.findUnique({ where: { id } });
    },

    async findRefreshTokensByUserId(userId: string) {
      return prisma.refresh_tokens.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'asc' },
      });
    },

    async findSettingByKey(key: string) {
      return prisma.settings.findUnique({ where: { key } });
    },

    async findFamilyMembersByCustomerId(customerId: string) {
      return prisma.family_members.findMany({
        where: { customer_id: customerId },
        orderBy: { created_at: 'asc' },
      });
    },

    async findGuarantorsByCustomerId(customerId: string) {
      return prisma.guarantors.findMany({
        where: { customer_id: customerId },
        orderBy: { created_at: 'asc' },
      });
    },

    // ── Aggregate Queries ──────────────────────────────────────────────────

    async sumAllocationsForCollection(collectionId: string) {
      const result = await prisma.collection_allocations.aggregate({
        where: { collection_id: collectionId },
        _sum: {
          penalty_paise: true,
          interest_paise: true,
          principal_paise: true,
        },
      });

      return {
        penalty: result._sum.penalty_paise ?? BigInt(0),
        interest: result._sum.interest_paise ?? BigInt(0),
        principal: result._sum.principal_paise ?? BigInt(0),
      };
    },

    async getLoanOutstanding(loanId: string) {
      const loan = await prisma.loans.findUnique({
        where: { id: loanId },
        select: { cached_outstanding_paise: true },
      });

      return loan?.cached_outstanding_paise ?? BigInt(0);
    },

    async getTrialBalanceTotals() {
      const result = await prisma.journal_lines.aggregate({
        _sum: {
          debit_paise: true,
          credit_paise: true,
        },
      });

      return {
        totalDebits: result._sum.debit_paise ?? BigInt(0),
        totalCredits: result._sum.credit_paise ?? BigInt(0),
      };
    },

    async getCashbookBalance(date: string) {
      const targetDate = new Date(date);

      // Opening balance: sum of all transactions before the target date
      const beforeTarget = await prisma.cash_transactions.findMany({
        where: { transaction_date: { lt: targetDate } },
        select: { type: true, amount_paise: true },
      });

      let opening = BigInt(0);
      for (const tx of beforeTarget) {
        if (tx.type === 'inflow') {
          opening += tx.amount_paise;
        } else {
          opening -= tx.amount_paise;
        }
      }

      // Inflows and outflows on the target date
      const onDate = await prisma.cash_transactions.findMany({
        where: { transaction_date: targetDate },
        select: { type: true, amount_paise: true },
      });

      let inflows = BigInt(0);
      let outflows = BigInt(0);
      for (const tx of onDate) {
        if (tx.type === 'inflow') {
          inflows += tx.amount_paise;
        } else {
          outflows += tx.amount_paise;
        }
      }

      const closing = opening + inflows - outflows;

      return { opening, inflows, outflows, closing };
    },

    async countReceiptsForLoan(loanId: string) {
      return prisma.receipts.count({ where: { loan_id: loanId } });
    },

    async getReceiptNumberRange(loanId: string) {
      const receipts = await prisma.receipts.findMany({
        where: { loan_id: loanId },
        select: { receipt_number: true },
        orderBy: { receipt_number: 'asc' },
      });

      if (receipts.length === 0) {
        return { min: '', max: '' };
      }

      return {
        min: receipts[0]!.receipt_number,
        max: receipts[receipts.length - 1]!.receipt_number,
      };
    },

    // ── Cleanup ────────────────────────────────────────────────────────────

    async cleanupTestData(prefix: string) {
      // Delete in reverse dependency order to respect foreign key constraints.
      // Only delete records whose identifying text fields start with the prefix.

      // 1. Outbox messages (no dependents)
      await prisma.outbox_messages.deleteMany({
        where: { source_type: { startsWith: prefix } },
      });

      // 2. Audit logs (no dependents)
      await prisma.audit_logs.deleteMany({
        where: { target_entity: { startsWith: prefix } },
      });

      // 3. Journal lines → journal entries
      const testJournalEntries = await prisma.journal_entries.findMany({
        where: { description: { startsWith: prefix } },
        select: { id: true },
      });
      const jeIds = testJournalEntries.map((je) => je.id);
      if (jeIds.length > 0) {
        await prisma.journal_lines.deleteMany({
          where: { journal_entry_id: { in: jeIds } },
        });
        await prisma.journal_entries.deleteMany({
          where: { id: { in: jeIds } },
        });
      }

      // 4. Receipts (depends on collections, loans, customers)
      await prisma.receipts.deleteMany({
        where: { loan_number: { startsWith: prefix } },
      });

      // 5. Collection allocations → collections
      const testCollections = await prisma.collections.findMany({
        where: { idempotency_key: { startsWith: prefix } },
        select: { id: true },
      });
      const collIds = testCollections.map((c) => c.id);
      if (collIds.length > 0) {
        await prisma.collection_allocations.deleteMany({
          where: { collection_id: { in: collIds } },
        });
        await prisma.collections.deleteMany({
          where: { id: { in: collIds } },
        });
      }

      // 6. Penalties
      await prisma.penalties.deleteMany({
        where: { penalty_period: { startsWith: prefix } },
      });

      // 7. Foreclosures
      const testLoans = await prisma.loans.findMany({
        where: { loan_number: { startsWith: prefix } },
        select: { id: true },
      });
      const loanIds = testLoans.map((l) => l.id);
      if (loanIds.length > 0) {
        await prisma.foreclosures.deleteMany({
          where: { loan_id: { in: loanIds } },
        });

        // 8. Overdue entries
        await prisma.overdue_entries.deleteMany({
          where: { loan_id: { in: loanIds } },
        });

        // 9. Disbursements
        await prisma.disbursements.deleteMany({
          where: { loan_id: { in: loanIds } },
        });

        // 10. Loan schedules
        await prisma.loan_schedules.deleteMany({
          where: { loan_id: { in: loanIds } },
        });

        // 11. Loan approvals & status history
        await prisma.loan_approvals.deleteMany({
          where: { loan_id: { in: loanIds } },
        });
        await prisma.loan_status_history.deleteMany({
          where: { loan_id: { in: loanIds } },
        });

        // 12. Loans
        await prisma.loans.deleteMany({
          where: { id: { in: loanIds } },
        });
      }

      // 13. Group members → groups
      const testGroups = await prisma.groups.findMany({
        where: { name: { startsWith: prefix } },
        select: { id: true },
      });
      const groupIds = testGroups.map((g) => g.id);
      if (groupIds.length > 0) {
        await prisma.group_members.deleteMany({
          where: { group_id: { in: groupIds } },
        });
        await prisma.group_collections.deleteMany({
          where: { group_id: { in: groupIds } },
        });
        await prisma.groups.deleteMany({
          where: { id: { in: groupIds } },
        });
      }

      // 14. Family members & guarantors → customers
      const testCustomers = await prisma.customers.findMany({
        where: { full_name: { startsWith: prefix } },
        select: { id: true },
      });
      const custIds = testCustomers.map((c) => c.id);
      if (custIds.length > 0) {
        await prisma.family_members.deleteMany({
          where: { customer_id: { in: custIds } },
        });
        await prisma.guarantors.deleteMany({
          where: { customer_id: { in: custIds } },
        });
        await prisma.customer_documents.deleteMany({
          where: { customer_id: { in: custIds } },
        });
        await prisma.customers.deleteMany({
          where: { id: { in: custIds } },
        });
      }

      // 15. Expenses
      await prisma.expenses.deleteMany({
        where: { description: { startsWith: prefix } },
      });

      // 16. Cash transactions
      await prisma.cash_transactions.deleteMany({
        where: { description: { startsWith: prefix } },
      });

      // 17. Cash handover records — no text prefix field, skip unless linked

      // 18. Refresh tokens & users
      const testUsers = await prisma.users.findMany({
        where: { username: { startsWith: prefix } },
        select: { id: true },
      });
      const userIds = testUsers.map((u) => u.id);
      if (userIds.length > 0) {
        await prisma.refresh_tokens.deleteMany({
          where: { user_id: { in: userIds } },
        });
        await prisma.user_area_assignments.deleteMany({
          where: { user_id: { in: userIds } },
        });
        await prisma.users.deleteMany({
          where: { id: { in: userIds } },
        });
      }

      // 19. Idempotency keys
      await prisma.idempotency_keys.deleteMany({
        where: { key: { startsWith: prefix } },
      });
    },
  };
}
