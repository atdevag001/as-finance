import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ReportService, REPORT_TYPES } from '../report.service';
import { ReportRepository } from '../report.repository';
import { ReportExportService } from '../report-export.service';

/**
 * Unit tests for ReportService.
 * Validates: Requirements 32.1, 32.2, 32.3, 32.4, 32.5, 32.6, 32.7, 32.8, 32.9, 32.10
 */

function createMockRepo() {
  return {
    getActiveAreas: vi.fn().mockResolvedValue([]),
    getAssignedCustomerIds: vi.fn().mockResolvedValue([]),
    getLoanIdsForAreas: vi.fn().mockResolvedValue([]),
    getDailyCollections: vi.fn().mockResolvedValue({ collections: [], journalLines: [] }),
    getOverdueLoans: vi.fn().mockResolvedValue([]),
    getLoanPortfolio: vi.fn().mockResolvedValue([]),
    getDpdAging: vi.fn().mockResolvedValue({ loans: [], journalTotals: [] }),
    getDisbursements: vi.fn().mockResolvedValue([]),
    getEmiScheduleReport: vi.fn().mockResolvedValue([]),
    getTrialBalanceData: vi.fn().mockResolvedValue([]),
    getAccountsMap: vi.fn().mockResolvedValue(new Map()),
    getProfitLossData: vi.fn().mockResolvedValue([]),
    getBalanceSheetData: vi.fn().mockResolvedValue([]),
  };
}

function createMockExportService() {
  return {
    generateExcel: vi.fn().mockResolvedValue(Buffer.from('mock-excel-content')),
    generatePdf: vi.fn().mockResolvedValue(Buffer.from('mock-pdf-content')),
  };
}

describe('ReportService', () => {
  let service: ReportService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockRepo: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockExportService: any;

  beforeEach(() => {
    mockRepo = createMockRepo();
    mockExportService = createMockExportService();
    service = new ReportService(
      mockRepo as unknown as ReportRepository,
      mockExportService as unknown as ReportExportService,
    );
  });

  describe('REPORT_TYPES', () => {
    it('should define exactly 21 report types', () => {
      expect(REPORT_TYPES).toHaveLength(21);
    });

    it('should include all required report types', () => {
      const required = [
        'daily-collection', 'overdue', 'disbursement', 'loan-portfolio',
        'customer', 'repayment-schedule', 'emi-schedule', 'receipt-register', 'cash-handover',
        'expense', 'income', 'trial-balance', 'profit-loss', 'balance-sheet',
        'group-summary', 'group-collection', 'penalty', 'foreclosure',
        'audit-trail', 'dpd-aging', 'officer-performance',
      ];
      for (const type of required) {
        expect(REPORT_TYPES).toContain(type);
      }
    });
  });

  describe('generateReport', () => {
    const fullAccessUser = { sub: 'user-1', role: 'super_admin' };

    it('should reject unknown report types', async () => {
      await expect(
        service.generateReport('nonexistent', {}, fullAccessUser),
      ).rejects.toThrow('Unknown report type');
    });

    it('should generate daily-collection report', async () => {
      mockRepo.getDailyCollections.mockResolvedValue({
        collections: [
          {
            id: 'c1',
            loan_id: 'l1',
            amount_paise: BigInt(50000),
            payment_date: new Date('2024-01-15'),
            payment_mode: 'cash',
            collected_by: 'u1',
            journal_entry_id: 'je1',
            loan: { loan_number: 'LN-2024-00001', customer: { id: 'cust1', full_name: 'Test' } },
            collector: { id: 'u1', full_name: 'Officer' },
          },
        ],
        journalLines: [
          { journal_entry_id: 'je1', debit_paise: BigInt(50000), credit_paise: BigInt(0), account: { code: '1001', name: 'Cash', category: 'asset' } },
        ],
      });

      const result: any = await service.generateReport(
        'daily-collection',
        { startDate: '2024-01-15', endDate: '2024-01-15' },
        fullAccessUser,
      );

      expect(result.reportType).toBe('daily-collection');
      expect(result.summary.totalCollections).toBe(1);
      expect(result.summary.totalCollectedPaise).toBe('50000');
    });

    it('should generate overdue report grouped by bucket', async () => {
      mockRepo.getOverdueLoans.mockResolvedValue([
        {
          id: 'l1', loan_number: 'LN-2024-00001', principal_paise: BigInt(100000),
          total_payable_paise: BigInt(112000), cached_outstanding_paise: BigInt(60000),
          dpd: 15, overdue_bucket: 'bucket_1_30', status: 'overdue',
          customer: { id: 'c1', full_name: 'Test', mobile: '9876543210' },
          creator: { id: 'u1', full_name: 'Officer' },
        },
        {
          id: 'l2', loan_number: 'LN-2024-00002', principal_paise: BigInt(200000),
          total_payable_paise: BigInt(224000), cached_outstanding_paise: BigInt(180000),
          dpd: 45, overdue_bucket: 'bucket_31_60', status: 'overdue',
          customer: { id: 'c2', full_name: 'Test2', mobile: '9876543211' },
          creator: { id: 'u1', full_name: 'Officer' },
        },
      ]);

      const result: any = await service.generateReport('overdue', {}, fullAccessUser);

      expect(result.reportType).toBe('overdue');
      expect(result.summary.totalOverdueLoans).toBe(2);
      expect(result.summary.byBucket).toEqual({ bucket_1_30: 1, bucket_31_60: 1 });
    });

    it('should generate loan-portfolio report with status breakdown', async () => {
      mockRepo.getLoanPortfolio.mockResolvedValue([
        {
          id: 'l1', loan_number: 'LN-1', principal_paise: BigInt(100000),
          total_interest_paise: BigInt(12000), total_payable_paise: BigInt(112000),
          cached_outstanding_paise: BigInt(50000), tenure_months: 12,
          status: 'active', dpd: 0, overdue_bucket: null,
          customer: { id: 'c1', full_name: 'A' },
          product_version: { id: 'pv1', interest_type: 'flat', annual_rate_bps: 1200, product: { name: 'P1' } },
          creator: { id: 'u1', full_name: 'O1' },
        },
      ]);

      const result: any = await service.generateReport('loan-portfolio', {}, fullAccessUser);

      expect(result.reportType).toBe('loan-portfolio');
      expect(result.summary.totalLoans).toBe(1);
      expect(result.summary.byStatus).toEqual({ active: 1 });
    });

    it('should generate dpd-aging report', async () => {
      mockRepo.getDpdAging.mockResolvedValue({
        loans: [
          {
            id: 'l1', loan_number: 'LN-1', principal_paise: BigInt(100000),
            total_payable_paise: BigInt(112000), cached_outstanding_paise: BigInt(60000),
            dpd: 35, overdue_bucket: 'bucket_31_60', status: 'overdue',
            customer: { id: 'c1', full_name: 'A' },
          },
        ],
        journalTotals: [],
      });

      const result: any = await service.generateReport('dpd-aging', {}, fullAccessUser);

      expect(result.reportType).toBe('dpd-aging');
      expect(result.summary.totalLoans).toBe(1);
      expect(result.summary.byBucket).toHaveProperty('bucket_31_60');
    });

    it('should generate disbursement report with date-range filtering', async () => {
      mockRepo.getDisbursements.mockResolvedValue([
        {
          id: 'd1', loan_id: 'l1', amount_paise: BigInt(500000),
          mode: 'bank_transfer', reference_number: 'REF-001',
          disbursed_at: new Date('2024-03-10'),
          loan: { loan_number: 'LN-2024-00001', customer: { id: 'c1', full_name: 'A' }, product_version: { product: { name: 'P1' } } },
          disbursed_by_user: { id: 'u1', full_name: 'Manager' },
        },
        {
          id: 'd2', loan_id: 'l2', amount_paise: BigInt(300000),
          mode: 'cash', reference_number: 'REF-002',
          disbursed_at: new Date('2024-03-12'),
          loan: { loan_number: 'LN-2024-00002', customer: { id: 'c2', full_name: 'B' }, product_version: { product: { name: 'P1' } } },
          disbursed_by_user: { id: 'u1', full_name: 'Manager' },
        },
      ]);

      const result: any = await service.generateReport(
        'disbursement',
        { startDate: '2024-03-01', endDate: '2024-03-31' },
        fullAccessUser,
      );

      expect(result.reportType).toBe('disbursement');
      expect(result.summary.totalDisbursements).toBe(2);
      expect(result.summary.totalDisbursedPaise).toBe('800000');
      expect(result.filters.startDate).toBeDefined();
      expect(result.filters.endDate).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.data[0].amount_paise).toBe('500000');
    });

    it('should generate emi-schedule report with status filtering', async () => {
      const pastDueDate = new Date();
      pastDueDate.setDate(pastDueDate.getDate() - 5);

      mockRepo.getEmiScheduleReport.mockResolvedValue([
        {
          id: 'emi1',
          installment_number: 1,
          due_date: pastDueDate,
          total_paise: BigInt(10000),
          principal_paise: BigInt(8000),
          interest_paise: BigInt(2000),
          principal_paid_paise: BigInt(0),
          interest_paid_paise: BigInt(0),
          status: 'overdue',
          loan: {
            id: 'l1',
            loan_number: 'LN-2024-00001',
            customer: { id: 'c1', full_name: 'Test Customer', mobile: '9876543210' },
          },
        },
        {
          id: 'emi2',
          installment_number: 2,
          due_date: new Date(),
          total_paise: BigInt(10000),
          principal_paise: BigInt(8000),
          interest_paise: BigInt(2000),
          principal_paid_paise: BigInt(8000),
          interest_paid_paise: BigInt(2000),
          status: 'paid',
          loan: {
            id: 'l1',
            loan_number: 'LN-2024-00001',
            customer: { id: 'c1', full_name: 'Test Customer', mobile: '9876543210' },
          },
        },
      ]);

      const result: any = await service.generateReport(
        'emi-schedule',
        { startDate: '2024-01-01', endDate: '2024-12-31', status: 'all' },
        fullAccessUser,
      );

      expect(result.reportType).toBe('emi-schedule');
      expect(result.summary.totalEmis).toBe(2);
      expect(result.summary.paidCount).toBe(1);
      expect(result.summary.overdueCount).toBe(1);
      expect(result.columns).toBeDefined();
      expect(result.columns.length).toBeGreaterThan(0);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].customerName).toBe('Test Customer');
      expect(result.data[0].loanNumber).toBe('LN-2024-00001');
      expect(result.data[0].overdueDays).toBeGreaterThan(0);
      expect(result.data[1].overdueDays).toBe(0);
    });

    it('should aggregate multiple daily collections with multiple journal entries', async () => {
      mockRepo.getDailyCollections.mockResolvedValue({
        collections: [
          {
            id: 'c1', loan_id: 'l1', amount_paise: BigInt(30000),
            payment_date: new Date('2024-01-15'), payment_mode: 'cash',
            collected_by: 'u1', journal_entry_id: 'je1',
            loan: { loan_number: 'LN-1', customer: { id: 'cust1', full_name: 'A' } },
            collector: { id: 'u1', full_name: 'O1' },
          },
          {
            id: 'c2', loan_id: 'l2', amount_paise: BigInt(20000),
            payment_date: new Date('2024-01-15'), payment_mode: 'cash',
            collected_by: 'u1', journal_entry_id: 'je2',
            loan: { loan_number: 'LN-2', customer: { id: 'cust2', full_name: 'B' } },
            collector: { id: 'u1', full_name: 'O1' },
          },
        ],
        journalLines: [
          { journal_entry_id: 'je1', debit_paise: BigInt(30000), credit_paise: BigInt(0) },
          { journal_entry_id: 'je2', debit_paise: BigInt(20000), credit_paise: BigInt(0) },
        ],
      });

      const result: any = await service.generateReport(
        'daily-collection',
        { startDate: '2024-01-15', endDate: '2024-01-15' },
        fullAccessUser,
      );

      expect(result.summary.totalCollections).toBe(2);
      expect(result.summary.totalCollectedPaise).toBe('50000');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].ledgerVerified).toBe(true);
      expect(result.data[1].ledgerVerified).toBe(true);
    });

    it('should return stub for unimplemented report types', async () => {
      const stubbedTypes = [
        'customer', 'repayment-schedule', 'receipt-register', 'cash-handover',
        'expense', 'income', 'group-summary', 'group-collection', 'penalty',
        'foreclosure', 'audit-trail', 'officer-performance',
      ];

      for (const type of stubbedTypes) {
        const result: any = await service.generateReport(type, {}, fullAccessUser);
        expect(result.reportType).toBe(type);
        expect(result.summary.message).toContain('not yet fully implemented');
        expect(result.data).toEqual([]);
      }
    });
  });

  describe('RBAC scope filtering', () => {
    it('should give full access to super_admin', async () => {
      await service.generateReport('overdue', {}, { sub: 'u1', role: 'super_admin' });
      expect(mockRepo.getAssignedCustomerIds).not.toHaveBeenCalled();
      expect(mockRepo.getActiveAreas).not.toHaveBeenCalled();
    });

    it('should give full access to manager', async () => {
      await service.generateReport('overdue', {}, { sub: 'u1', role: 'manager' });
      expect(mockRepo.getAssignedCustomerIds).not.toHaveBeenCalled();
    });

    it('should give full access to accountant', async () => {
      await service.generateReport('overdue', {}, { sub: 'u1', role: 'accountant' });
      expect(mockRepo.getAssignedCustomerIds).not.toHaveBeenCalled();
    });

    it('should give full access to viewer_auditor', async () => {
      await service.generateReport('overdue', {}, { sub: 'u1', role: 'viewer_auditor' });
      expect(mockRepo.getAssignedCustomerIds).not.toHaveBeenCalled();
    });

    it('should scope field_officer to own assigned data', async () => {
      mockRepo.getAssignedCustomerIds.mockResolvedValue(['cust-1', 'cust-2']);

      await service.generateReport('overdue', {}, { sub: 'fo-1', role: 'field_officer' });

      expect(mockRepo.getAssignedCustomerIds).toHaveBeenCalledWith('fo-1');
      expect(mockRepo.getOverdueLoans).toHaveBeenCalledWith(
        expect.objectContaining({ officerId: 'fo-1' }),
      );
    });

    it('should scope collection_officer to assigned areas', async () => {
      mockRepo.getActiveAreas.mockResolvedValue(['Area-A', 'Area-B']);
      mockRepo.getLoanIdsForAreas.mockResolvedValue(['loan-1', 'loan-2']);

      await service.generateReport('overdue', {}, { sub: 'co-1', role: 'collection_officer' });

      expect(mockRepo.getActiveAreas).toHaveBeenCalledWith('co-1');
      expect(mockRepo.getLoanIdsForAreas).toHaveBeenCalledWith(['Area-A', 'Area-B']);
      expect(mockRepo.getOverdueLoans).toHaveBeenCalledWith(
        expect.objectContaining({ loanIdScope: ['loan-1', 'loan-2'] }),
      );
    });

    it('should return empty loanIds for collection_officer with no assigned areas', async () => {
      mockRepo.getActiveAreas.mockResolvedValue([]);

      await service.generateReport('overdue', {}, { sub: 'co-2', role: 'collection_officer' });

      expect(mockRepo.getActiveAreas).toHaveBeenCalledWith('co-2');
      expect(mockRepo.getLoanIdsForAreas).not.toHaveBeenCalled();
      expect(mockRepo.getOverdueLoans).toHaveBeenCalledWith(
        expect.objectContaining({ loanIdScope: [] }),
      );
    });

    it('should resolve scope to none for unknown/unrecognized roles', async () => {
      await service.generateReport('overdue', {}, { sub: 'u1', role: 'office_staff' });

      expect(mockRepo.getAssignedCustomerIds).not.toHaveBeenCalled();
      expect(mockRepo.getActiveAreas).not.toHaveBeenCalled();
      // 'none' scope results in loanIdScope: [] filter
      expect(mockRepo.getOverdueLoans).toHaveBeenCalledWith(
        expect.objectContaining({ loanIdScope: [] }),
      );
    });
  });

  describe('exportReport', () => {
    const user = { sub: 'u1', role: 'super_admin' };

    it('should return buffer and metadata for valid formats', async () => {
      for (const format of ['pdf', 'xlsx']) {
        const result = await service.exportReport('overdue', format, {}, user);
        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(0);
        expect(result.filename).toContain(format);
      }
    });

    it('should set correct MIME types', async () => {
      const pdf = await service.exportReport('overdue', 'pdf', {}, user);
      expect(pdf.mimeType).toBe('application/pdf');

      const xlsx = await service.exportReport('overdue', 'xlsx', {}, user);
      expect(xlsx.mimeType).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });

    it('should reject unsupported export formats', async () => {
      await expect(
        service.exportReport('overdue', 'html', {}, user),
      ).rejects.toThrow('Unsupported export format');

      await expect(
        service.exportReport('overdue', 'csv', {}, user),
      ).rejects.toThrow('Unsupported export format');
    });
  });

  describe('trial-balance report', () => {
    it('should derive totals from journal_lines', async () => {
      const accountsMap = new Map([
        ['acc-1', { code: '1001', name: 'Cash', category: 'asset' }],
        ['acc-2', { code: '4001', name: 'Interest Income', category: 'income' }],
      ]);
      mockRepo.getAccountsMap.mockResolvedValue(accountsMap);
      mockRepo.getTrialBalanceData.mockResolvedValue([
        { account_id: 'acc-1', _sum: { debit_paise: BigInt(100000), credit_paise: BigInt(50000) } },
        { account_id: 'acc-2', _sum: { debit_paise: BigInt(0), credit_paise: BigInt(50000) } },
      ]);

      const result: any = await service.generateReport(
        'trial-balance',
        { asOfDate: '2024-06-30' },
        { sub: 'u1', role: 'super_admin' },
      );

      expect(result.reportType).toBe('trial-balance');
      expect(result.summary.totalDebitPaise).toBe('100000');
      expect(result.summary.totalCreditPaise).toBe('100000');
      expect(result.summary.isBalanced).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  describe('profit-loss report', () => {
    it('should compute net profit from journal_lines', async () => {
      mockRepo.getProfitLossData.mockResolvedValue([
        { debit_paise: BigInt(0), credit_paise: BigInt(80000), account: { id: 'a1', code: '4001', name: 'Interest Income', category: 'income' } },
        { debit_paise: BigInt(30000), credit_paise: BigInt(0), account: { id: 'a2', code: '5001', name: 'Salary Expense', category: 'expense' } },
      ]);

      const result: any = await service.generateReport(
        'profit-loss',
        { startDate: '2024-01-01', endDate: '2024-06-30' },
        { sub: 'u1', role: 'super_admin' },
      );

      expect(result.reportType).toBe('profit-loss');
      expect(result.summary.totalIncomePaise).toBe('80000');
      expect(result.summary.totalExpensePaise).toBe('30000');
      expect(result.summary.netProfitPaise).toBe('50000');
    });
  });

  describe('balance-sheet report', () => {
    it('should verify assets = liabilities + equity', async () => {
      mockRepo.getBalanceSheetData.mockResolvedValue([
        { debit_paise: BigInt(200000), credit_paise: BigInt(0), account: { id: 'a1', code: '1001', name: 'Cash', category: 'asset' } },
        { debit_paise: BigInt(0), credit_paise: BigInt(100000), account: { id: 'a2', code: '3001', name: 'Equity', category: 'equity' } },
        { debit_paise: BigInt(0), credit_paise: BigInt(50000), account: { id: 'a3', code: '4001', name: 'Interest Income', category: 'income' } },
        { debit_paise: BigInt(0), credit_paise: BigInt(50000), account: { id: 'a4', code: '2001', name: 'Liability', category: 'liability' } },
      ]);

      const result: any = await service.generateReport(
        'balance-sheet',
        { asOfDate: '2024-06-30' },
        { sub: 'u1', role: 'super_admin' },
      );

      expect(result.reportType).toBe('balance-sheet');
      // Assets = 200000, Liabilities = 50000, Equity = 100000 + retained (50000 income) = 150000
      // 200000 === 50000 + 150000
      expect(result.summary.isBalanced).toBe(true);
    });

    it('should default asOfDate to now when not provided', async () => {
      mockRepo.getBalanceSheetData.mockResolvedValue([]);

      const result: any = await service.generateReport(
        'balance-sheet',
        {},
        { sub: 'u1', role: 'super_admin' },
      );

      expect(result.reportType).toBe('balance-sheet');
      expect(result.asOfDate).toBeDefined();
    });
  });

  describe('parseDateRange defaults', () => {
    const user = { sub: 'u1', role: 'super_admin' };

    it('should use provided startDate and endDate', async () => {
      mockRepo.getDisbursements.mockResolvedValue([]);

      const result: any = await service.generateReport(
        'disbursement',
        { startDate: '2024-06-01', endDate: '2024-06-30' },
        user,
      );

      expect(result.filters.startDate).toContain('2024-06-01');
      expect(result.filters.endDate).toContain('2024-06-30');
    });

    it('should default startDate to today and endDate to now when not provided', async () => {
      mockRepo.getDailyCollections.mockResolvedValue({ collections: [], journalLines: [] });

      const before = new Date();
      const result: any = await service.generateReport('daily-collection', {}, user);
      const after = new Date();

      // startDate should be start of today (midnight)
      const startDate = new Date(result.filters.startDate);
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(startDate.getSeconds()).toBe(0);

      // endDate should be approximately now
      const endDate = new Date(result.filters.endDate);
      expect(endDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(endDate.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('should default only endDate when startDate is provided', async () => {
      mockRepo.getDisbursements.mockResolvedValue([]);

      const result: any = await service.generateReport(
        'disbursement',
        { startDate: '2024-01-01' },
        user,
      );

      expect(result.filters.startDate).toContain('2024-01-01');
      // endDate defaults to now
      const endDate = new Date(result.filters.endDate);
      const now = new Date();
      expect(Math.abs(endDate.getTime() - now.getTime())).toBeLessThan(5000);
    });

    it('should default only startDate when endDate is provided', async () => {
      mockRepo.getDisbursements.mockResolvedValue([]);

      const result: any = await service.generateReport(
        'disbursement',
        { endDate: '2024-12-31' },
        user,
      );

      // startDate defaults to start of today
      const startDate = new Date(result.filters.startDate);
      expect(startDate.getHours()).toBe(0);
      expect(startDate.getMinutes()).toBe(0);
      expect(result.filters.endDate).toContain('2024-12-31');
    });
  });

  describe('trial-balance report — edge cases', () => {
    it('should default asOfDate to now when not provided', async () => {
      mockRepo.getTrialBalanceData.mockResolvedValue([]);
      mockRepo.getAccountsMap.mockResolvedValue(new Map());

      const result: any = await service.generateReport(
        'trial-balance',
        {},
        { sub: 'u1', role: 'super_admin' },
      );

      expect(result.asOfDate).toBeDefined();
      expect(result.summary.isBalanced).toBe(true);
      expect(result.data).toHaveLength(0);
    });

    it('should handle unknown account_id gracefully', async () => {
      mockRepo.getAccountsMap.mockResolvedValue(new Map());
      mockRepo.getTrialBalanceData.mockResolvedValue([
        { account_id: 'unknown-acc', _sum: { debit_paise: BigInt(1000), credit_paise: BigInt(0) } },
      ]);

      const result: any = await service.generateReport(
        'trial-balance',
        { asOfDate: '2024-06-30' },
        { sub: 'u1', role: 'super_admin' },
      );

      expect(result.data[0].code).toBe('unknown');
      expect(result.data[0].name).toBe('unknown');
      expect(result.data[0].category).toBe('unknown');
    });
  });
});
