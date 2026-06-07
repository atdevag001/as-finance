import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { todayISTDate } from '../../common/utils/date.util';
import { isUnrestrictedRole } from '../../common/constants/roles';
import { UserRole } from '@as-finance/shared';

export interface DashboardKPIs {
  totalCustomers: number;
  activeLoans: number;
  overdueLoans: number;
  totalOutstandingPaise: number;
  todayCollectionsPaise: number;
  todayDisbursementsPaise: number;
  pendingApprovals: number;
}

/** Loan statuses that still require manager attention before money moves. */
const PENDING_APPROVAL_STATUSES = ['submitted', 'under_review', 'approved'] as const;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getKPIs(actorId?: string, actorRole?: string): Promise<DashboardKPIs> {
    // Get today's date range anchored to IST midnight (business calendar).
    // Using server-local setHours(0,0,0,0) shifts the boundary by the host TZ,
    // bleeding records from neighboring IST days into today's KPIs.
    const todayStart = todayISTDate();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    // Per-role scope so field officers and collection officers do not see org-wide
    // book-of-business totals (permission grants 'dashboard.read' broadly, but
    // scope constraints must be enforced at the service layer).
    const scope = this.buildScope(actorId, actorRole);

    // Run all queries in parallel for performance
    const [
      totalCustomers,
      activeLoans,
      overdueLoans,
      outstandingAgg,
      todayCollectionsAgg,
      todayDisbursementsAgg,
      pendingApprovals,
    ] = await Promise.all([
      // Total active customers
      this.prisma['customers'].count({
        where: { status: 'active', ...scope.customerWhere },
      }),

      // Active loans
      this.prisma['loans'].count({
        where: { status: 'active', ...scope.loanWhere },
      }),

      // Overdue loans
      this.prisma['loans'].count({
        where: { status: 'overdue', ...scope.loanWhere },
      }),

      // Total outstanding (sum of cached_outstanding_paise for active/overdue loans)
      this.prisma['loans'].aggregate({
        _sum: { cached_outstanding_paise: true },
        where: { status: { in: ['active', 'overdue'] }, ...scope.loanWhere },
      }),

      // Today's collections — exclude reversal rows (negative amounts) so the
      // KPI reflects gross posted receipts; same-day reversals would otherwise
      // net the figure and confuse cash-out reconciliation.
      this.prisma['collections'].aggregate({
        _sum: { amount_paise: true },
        where: {
          status: 'posted',
          is_reversal: false,
          payment_date: { gte: todayStart, lte: todayEnd },
          ...scope.collectionWhere,
        },
      }),

      // Today's disbursements
      this.prisma['loans'].aggregate({
        _sum: { principal_paise: true },
        where: {
          status: { in: ['active', 'overdue', 'closed'] },
          disbursement_date: { gte: todayStart, lte: todayEnd },
          ...scope.loanWhere,
        },
      }),

      // Pending loan approvals — include 'under_review' and 'approved' (awaiting
      // disbursement) so loans mid-workflow do not sit invisibly forever.
      this.prisma['loans'].count({
        where: { status: { in: [...PENDING_APPROVAL_STATUSES] }, ...scope.loanWhere },
      }),
    ]);

    // cashInHandPaise removed: previously aliased today's collections, misrepresenting cash position;
    // real cash-in-hand lives in the cashbook daily summary (opening + inflows - outflows).
    return {
      totalCustomers,
      activeLoans,
      overdueLoans,
      totalOutstandingPaise: Number(outstandingAgg._sum?.cached_outstanding_paise ?? 0),
      todayCollectionsPaise: Number(todayCollectionsAgg._sum?.amount_paise ?? 0),
      todayDisbursementsPaise: Number(todayDisbursementsAgg._sum?.principal_paise ?? 0),
      pendingApprovals,
    };
  }

  /**
   * Build per-role where-clause fragments.
   * - Unrestricted roles (super_admin, manager, accountant, office_staff, viewer_auditor): org-wide.
   * - field_officer: only customers/loans assigned to them.
   * - collection_officer: only collections they personally posted; loans/customers org-wide
   *   (collection officers act across the book, but their own performance metric is their receipts).
   */
  private buildScope(actorId?: string, actorRole?: string): {
    customerWhere: Record<string, unknown>;
    loanWhere: Record<string, unknown>;
    collectionWhere: Record<string, unknown>;
  } {
    if (!actorId || !actorRole || isUnrestrictedRole(actorRole)) {
      // collection_officer is in UNRESTRICTED_ROLES but we still narrow their
      // collections KPI to their own receipts for personal accountability.
      if (actorId && actorRole === UserRole.COLLECTION_OFFICER) {
        return {
          customerWhere: {},
          loanWhere: {},
          collectionWhere: { collected_by: actorId },
        };
      }
      return { customerWhere: {}, loanWhere: {}, collectionWhere: {} };
    }
    if (actorRole === UserRole.FIELD_OFFICER) {
      return {
        customerWhere: { assigned_officer_id: actorId },
        loanWhere: { customer: { assigned_officer_id: actorId } },
        collectionWhere: { loan: { customer: { assigned_officer_id: actorId } } },
      };
    }
    // Unknown restricted role — return nothing rather than leak org-wide data.
    // Use the nil UUID so the cast succeeds at the DB layer but matches no row.
    const NIL_UUID = '00000000-0000-0000-0000-000000000000';
    return {
      customerWhere: { id: NIL_UUID },
      loanWhere: { id: NIL_UUID },
      collectionWhere: { id: NIL_UUID },
    };
  }
}
