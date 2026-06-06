import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { todayISTDate } from '../../common/utils/date.util';

export interface DashboardKPIs {
  totalCustomers: number;
  activeLoans: number;
  overdueLoans: number;
  totalOutstandingPaise: number;
  todayCollectionsPaise: number;
  todayDisbursementsPaise: number;
  pendingApprovals: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getKPIs(): Promise<DashboardKPIs> {
    // Get today's date range anchored to IST midnight (business calendar).
    // Using server-local setHours(0,0,0,0) shifts the boundary by the host TZ,
    // bleeding records from neighboring IST days into today's KPIs.
    const todayStart = todayISTDate();
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

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
        where: { status: 'active' },
      }),

      // Active loans
      this.prisma['loans'].count({
        where: { status: 'active' },
      }),

      // Overdue loans
      this.prisma['loans'].count({
        where: { status: 'overdue' },
      }),

      // Total outstanding (sum of cached_outstanding_paise for active/overdue loans)
      this.prisma['loans'].aggregate({
        _sum: { cached_outstanding_paise: true },
        where: { status: { in: ['active', 'overdue'] } },
      }),

      // Today's collections
      this.prisma['collections'].aggregate({
        _sum: { amount_paise: true },
        where: {
          status: 'posted',
          payment_date: { gte: todayStart, lte: todayEnd },
        },
      }),

      // Today's disbursements
      this.prisma['loans'].aggregate({
        _sum: { principal_paise: true },
        where: {
          status: { in: ['active', 'overdue', 'closed'] },
          disbursement_date: { gte: todayStart, lte: todayEnd },
        },
      }),

      // Pending loan approvals (submitted status)
      this.prisma['loans'].count({
        where: { status: 'submitted' },
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
}
