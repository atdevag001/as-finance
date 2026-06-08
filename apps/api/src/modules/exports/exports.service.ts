import { Injectable, Logger } from '@nestjs/common';
import { AuditAction } from '@as-finance/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { ExcelService } from '../excel/excel.service';
import { ExportColumn } from '../excel/types';
import { SettingsService } from '../settings/settings.service';

export interface ExportFilters {
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  productVersionId?: string;
  paymentMode?: string;
  year?: number;
}

interface ExportContext {
  domain: string;
  actorId: string;
  actorRole: string;
  unmaskPii: boolean;
  filters: ExportFilters;
}

@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  constructor(
    private readonly excel: ExcelService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // Customers
  // ────────────────────────────────────────────────────────────────────────────
  async exportCustomers(ctx: ExportContext): Promise<{ buffer: Buffer; filename: string }> {
    const where: Record<string, unknown> = {};
    if (ctx.filters.status) where['status'] = ctx.filters.status;
    if (ctx.filters.search) {
      where['OR'] = [
        { full_name: { contains: ctx.filters.search, mode: 'insensitive' } },
        { mobile: { contains: ctx.filters.search } },
      ];
    }

    const rows = await this.prisma['customers'].findMany({
      where,
      take: 5000,
      orderBy: { created_at: 'desc' },
    });

    const columns: ExportColumn[] = [
      { key: 'full_name', label: 'Name', type: 'string' },
      { key: 'mobile', label: 'Mobile', type: 'string', mask: 'mobile' },
      { key: 'aadhaar', label: 'Aadhaar', type: 'string', mask: 'aadhaar' },
      { key: 'gender', label: 'Gender', type: 'string' },
      { key: 'city', label: 'City', type: 'string' },
      { key: 'district', label: 'District', type: 'string' },
      { key: 'pincode', label: 'Pincode', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'monthly_income_paise', label: 'Monthly Income (₹)', type: 'currency' },
      { key: 'created_at', label: 'Registered On', type: 'date' },
    ];

    const buffer = await this.excel.exportToBuffer(columns, rows as unknown as Record<string, unknown>[], {
      title: 'Customers',
      filters: this.formatFilters(ctx.filters),
      summary: { count: rows.length },
      unmaskPii: ctx.unmaskPii,
    });
    await this.audit_(ctx, 'customers', columns, rows.length);
    return { buffer, filename: `customers-${dateStamp()}.xlsx` };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Loans
  // ────────────────────────────────────────────────────────────────────────────
  async exportLoans(ctx: ExportContext): Promise<{ buffer: Buffer; filename: string }> {
    const where: Record<string, unknown> = {};
    if (ctx.filters.status) where['status'] = ctx.filters.status;
    if (ctx.filters.productVersionId) where['product_version_id'] = ctx.filters.productVersionId;
    if (ctx.filters.search) where['loan_number'] = { contains: ctx.filters.search };

    const rows = await this.prisma['loans'].findMany({
      where,
      include: { customer: { select: { full_name: true, mobile: true } } },
      take: 5000,
      orderBy: { created_at: 'desc' },
    });

    const columns: ExportColumn[] = [
      { key: 'loan_number', label: 'Loan #', type: 'string' },
      { key: 'customer_name', label: 'Customer', type: 'string' },
      { key: 'principal_paise', label: 'Principal (₹)', type: 'currency' },
      { key: 'tenure_months', label: 'Tenure (months)', type: 'number' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'cached_outstanding_paise', label: 'Outstanding (₹)', type: 'currency' },
      { key: 'dpd', label: 'DPD', type: 'number' },
      { key: 'overdue_bucket', label: 'Overdue Bucket', type: 'string' },
      { key: 'disbursement_date', label: 'Disbursed', type: 'date' },
      { key: 'created_at', label: 'Created', type: 'date' },
    ];

    const data = rows.map((r) => ({
      ...r,
      customer_name: (r as { customer?: { full_name?: string } }).customer?.full_name ?? '',
    }));

    const buffer = await this.excel.exportToBuffer(columns, data as unknown as Record<string, unknown>[], {
      title: 'Loans',
      filters: this.formatFilters(ctx.filters),
      summary: { count: rows.length },
      unmaskPii: ctx.unmaskPii,
    });
    await this.audit_(ctx, 'loans', columns, rows.length);
    return { buffer, filename: `loans-${dateStamp()}.xlsx` };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Loan Products
  // ────────────────────────────────────────────────────────────────────────────
  async exportLoanProducts(ctx: ExportContext): Promise<{ buffer: Buffer; filename: string }> {
    const rows = await this.prisma['loan_products'].findMany({
      include: { current_version: true },
      take: 5000,
      orderBy: { created_at: 'desc' },
    });

    const columns: ExportColumn[] = [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'interest_type', label: 'Interest Type', type: 'string' },
      { key: 'annual_rate_bps', label: 'Annual Rate (bps)', type: 'number' },
      { key: 'min_principal_paise', label: 'Min Principal (₹)', type: 'currency' },
      { key: 'max_principal_paise', label: 'Max Principal (₹)', type: 'currency' },
      { key: 'min_tenure_months', label: 'Min Tenure', type: 'number' },
      { key: 'max_tenure_months', label: 'Max Tenure', type: 'number' },
      { key: 'repayment_frequency', label: 'Frequency', type: 'string' },
    ];

    const data = rows.map((r: Record<string, unknown>) => {
      const v = (r['current_version'] as Record<string, unknown> | null) ?? {};
      return {
        name: r['name'] as string,
        status: (r['is_active'] === false ? 'inactive' : 'active') as string,
        ...v,
      };
    });

    const buffer = await this.excel.exportToBuffer(columns, data as Record<string, unknown>[], {
      title: 'Loan Products',
      summary: { count: rows.length },
      unmaskPii: ctx.unmaskPii,
    });
    await this.audit_(ctx, 'loan_products', columns, rows.length);
    return { buffer, filename: `loan-products-${dateStamp()}.xlsx` };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Collections
  // ────────────────────────────────────────────────────────────────────────────
  async exportCollections(ctx: ExportContext): Promise<{ buffer: Buffer; filename: string }> {
    const where: Record<string, unknown> = {};
    if (ctx.filters.startDate) where['payment_date'] = { gte: new Date(ctx.filters.startDate) };
    if (ctx.filters.endDate) {
      const upper = { lte: new Date(ctx.filters.endDate) };
      where['payment_date'] = where['payment_date']
        ? { ...(where['payment_date'] as object), ...upper }
        : upper;
    }
    if (ctx.filters.paymentMode) where['payment_mode'] = ctx.filters.paymentMode;

    const rows = await this.prisma['collections'].findMany({
      where,
      include: {
        loan: { select: { loan_number: true, customer: { select: { full_name: true } } } },
      },
      take: 5000,
      orderBy: { payment_date: 'desc' },
    });

    const columns: ExportColumn[] = [
      { key: 'payment_date', label: 'Payment Date', type: 'date' },
      { key: 'loan_number', label: 'Loan #', type: 'string' },
      { key: 'customer_name', label: 'Customer', type: 'string' },
      { key: 'amount_paise', label: 'Amount (₹)', type: 'currency' },
      { key: 'payment_mode', label: 'Mode', type: 'string' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'created_at', label: 'Recorded', type: 'date' },
    ];

    const data = rows.map((r: Record<string, unknown>) => ({
      ...r,
      loan_number: ((r['loan'] as { loan_number?: string } | null)?.loan_number) ?? '',
      customer_name:
        ((r['loan'] as { customer?: { full_name?: string } } | null)?.customer?.full_name) ?? '',
    }));

    const buffer = await this.excel.exportToBuffer(columns, data as unknown as Record<string, unknown>[], {
      title: 'Collections',
      filters: this.formatFilters(ctx.filters),
      summary: { count: rows.length },
      unmaskPii: ctx.unmaskPii,
    });
    await this.audit_(ctx, 'collections', columns, rows.length);
    return { buffer, filename: `collections-${dateStamp()}.xlsx` };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Groups
  // ────────────────────────────────────────────────────────────────────────────
  async exportGroups(ctx: ExportContext): Promise<{ buffer: Buffer; filename: string }> {
    const where: Record<string, unknown> = {};
    if (ctx.filters.status) where['status'] = ctx.filters.status;

    const rows = await this.prisma['groups'].findMany({
      where,
      include: {
        leader: { select: { full_name: true } },
        _count: { select: { members: true } },
      },
      take: 5000,
      orderBy: { created_at: 'desc' },
    });

    const columns: ExportColumn[] = [
      { key: 'name', label: 'Group Name', type: 'string' },
      { key: 'leader_name', label: 'Leader', type: 'string' },
      { key: 'meeting_day', label: 'Meeting Day', type: 'string' },
      { key: 'branch_area', label: 'Branch / Area', type: 'string' },
      { key: 'member_count', label: 'Members', type: 'number' },
      { key: 'status', label: 'Status', type: 'string' },
      { key: 'created_at', label: 'Created', type: 'date' },
    ];

    const data = rows.map((r: Record<string, unknown>) => ({
      ...r,
      leader_name: ((r['leader'] as { full_name?: string } | null)?.full_name) ?? '',
      member_count: ((r['_count'] as { members?: number } | undefined)?.members) ?? 0,
    }));

    const buffer = await this.excel.exportToBuffer(columns, data as unknown as Record<string, unknown>[], {
      title: 'Groups',
      filters: this.formatFilters(ctx.filters),
      summary: { count: rows.length },
      unmaskPii: ctx.unmaskPii,
    });
    await this.audit_(ctx, 'groups', columns, rows.length);
    return { buffer, filename: `groups-${dateStamp()}.xlsx` };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Settings (system settings, excluding the holiday calendar)
  // ────────────────────────────────────────────────────────────────────────────
  async exportSettings(ctx: ExportContext): Promise<{ buffer: Buffer; filename: string }> {
    const all = await this.settings.findAll();
    const filtered = all.filter((s) => s.key !== 'holiday_calendar');
    const data = filtered.map((s) => ({
      key: s.key,
      value: typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value),
      description: s.description ?? '',
    }));

    const columns: ExportColumn[] = [
      { key: 'key', label: 'Key', type: 'string' },
      { key: 'value', label: 'Value', type: 'string' },
      { key: 'description', label: 'Description', type: 'string' },
    ];

    const buffer = await this.excel.exportToBuffer(columns, data, {
      title: 'System Settings',
      summary: { count: data.length },
    });
    await this.audit_(ctx, 'settings', columns, data.length);
    return { buffer, filename: `settings-${dateStamp()}.xlsx` };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Holidays
  // ────────────────────────────────────────────────────────────────────────────
  async exportHolidays(ctx: ExportContext): Promise<{ buffer: Buffer; filename: string }> {
    const holidays = await this.settings.getHolidays();
    const year = ctx.filters.year;
    const filtered = year
      ? holidays.filter((d) => Number(d.slice(0, 4)) === year)
      : holidays;
    const data = filtered.map((d) => ({ date: d }));

    const columns: ExportColumn[] = [{ key: 'date', label: 'Date', type: 'date' }];

    const buffer = await this.excel.exportToBuffer(columns, data, {
      title: year ? `Holiday Calendar ${year}` : 'Holiday Calendar',
      summary: { count: filtered.length },
    });
    await this.audit_(ctx, 'holidays', columns, filtered.length);
    return { buffer, filename: `holidays-${year ?? 'all'}.xlsx` };
  }

  // ────────────────────────────────────────────────────────────────────────────

  private formatFilters(f: ExportFilters): Record<string, string> {
    const out: Record<string, string> = {};
    if (f.status) out['status'] = f.status;
    if (f.search) out['search'] = f.search;
    if (f.startDate) out['startDate'] = f.startDate;
    if (f.endDate) out['endDate'] = f.endDate;
    if (f.paymentMode) out['paymentMode'] = f.paymentMode;
    if (f.year) out['year'] = String(f.year);
    return out;
  }

  private async audit_(
    ctx: ExportContext,
    domain: string,
    columns: ExportColumn[],
    rowCount: number,
  ): Promise<void> {
    try {
      await this.audit.createAuditLog({
        action_type: AuditAction.DATA_EXPORTED,
        actor_id: ctx.actorId,
        actor_role: ctx.actorRole,
        target_entity: 'data_export',
        target_id: `${domain}-${Date.now()}`,
        after_state: {
          domain,
          rowCount,
          columns: columns.map((c) => c.key),
          filters: this.formatFilters(ctx.filters),
          piiUnmasked: ctx.unmaskPii,
        },
        remarks: `Exported ${rowCount} ${domain} row(s) to Excel${ctx.unmaskPii ? ' (PII UNMASKED)' : ''}`,
      });
    } catch (err) {
      this.logger.error(`Failed to write data_exported audit log for ${domain}`, err);
    }
  }
}

function dateStamp(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
