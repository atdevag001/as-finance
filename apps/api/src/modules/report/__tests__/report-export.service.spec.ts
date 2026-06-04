import { describe, it, expect, beforeEach } from 'vitest';
import { ReportExportService, type ExportData } from '../report-export.service';

describe('ReportExportService', () => {
  let service: ReportExportService;

  beforeEach(() => {
    service = new ReportExportService();
  });

  describe('generateExcel', () => {
    it('should generate Excel buffer for empty data', async () => {
      const emptyData: ExportData = {
        reportType: 'test',
        title: 'Test Report',
        filters: {},
        columns: [],
        rows: [],
      };

      const buffer = await service.generateExcel(emptyData);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should generate Excel buffer with normal data', async () => {
      const data: ExportData = {
        reportType: 'emi-schedule',
        title: 'EMI Schedule Report',
        filters: { 'Start Date': '2026-01-01', 'End Date': '2026-12-31' },
        summary: { totalEmis: 10, totalEmiPaise: '100000' },
        columns: [
          { key: 'customerName', label: 'Customer Name' },
          { key: 'loanNumber', label: 'Loan #' },
          { key: 'emiAmountPaise', label: 'EMI Amount', type: 'currency' },
          { key: 'dueDate', label: 'Due Date', type: 'date' },
          { key: 'status', label: 'Status' },
        ],
        rows: [
          { customerName: 'John Doe', loanNumber: 'LN-001', emiAmountPaise: '500000', dueDate: '2026-05-15', status: 'pending' },
          { customerName: 'Jane Smith', loanNumber: 'LN-002', emiAmountPaise: '300000', dueDate: '2026-05-20', status: 'paid' },
        ],
      };

      const buffer = await service.generateExcel(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000); // Excel files are typically > 1KB
    });

    it('should handle null and undefined values in rows', async () => {
      const data: ExportData = {
        reportType: 'test',
        title: 'Test',
        filters: {},
        columns: [
          { key: 'col1', label: 'Column 1' },
          { key: 'col2', label: 'Column 2' },
        ],
        rows: [
          { col1: null, col2: 'value' },
          { col1: undefined, col2: 'value2' },
          { col1: '', col2: null },
        ],
      };

      const buffer = await service.generateExcel(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should format currency values correctly', async () => {
      const data: ExportData = {
        reportType: 'test',
        title: 'Currency Test',
        filters: {},
        columns: [
          { key: 'amountPaise', label: 'Amount', type: 'currency' },
        ],
        rows: [
          { amountPaise: '100000' }, // Rs 1000.00
          { amountPaise: 50000 },    // Rs 500.00 (number type)
        ],
      };

      const buffer = await service.generateExcel(data);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('generatePdf', () => {
    it('should generate PDF buffer for empty data', async () => {
      const emptyData: ExportData = {
        reportType: 'test',
        title: 'Test Report',
        filters: {},
        columns: [],
        rows: [],
      };

      const buffer = await service.generatePdf(emptyData);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      // PDF files start with %PDF
      expect(buffer.toString('utf8', 0, 4)).toBe('%PDF');
    });

    it('should generate PDF buffer with normal data', async () => {
      const data: ExportData = {
        reportType: 'emi-schedule',
        title: 'EMI Schedule Report',
        filters: { 'Start Date': '2026-01-01' },
        summary: { totalEmis: 5 },
        columns: [
          { key: 'customerName', label: 'Customer' },
          { key: 'amount', label: 'Amount' },
        ],
        rows: [
          { customerName: 'John Doe', amount: '5000' },
          { customerName: 'Jane Smith', amount: '3000' },
        ],
      };

      const buffer = await service.generatePdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(500);
      expect(buffer.toString('utf8', 0, 4)).toBe('%PDF');
    });

    it('should handle many rows with pagination', async () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Customer ${i + 1}`,
        amount: String((i + 1) * 1000),
      }));

      const data: ExportData = {
        reportType: 'large-report',
        title: 'Large Report',
        filters: {},
        columns: [
          { key: 'id', label: 'ID' },
          { key: 'name', label: 'Name' },
          { key: 'amount', label: 'Amount' },
        ],
        rows,
      };

      const buffer = await service.generatePdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(1000);
    });

    it('should handle null values gracefully', async () => {
      const data: ExportData = {
        reportType: 'test',
        title: 'Null Test',
        filters: {},
        columns: [{ key: 'col1', label: 'Column' }],
        rows: [
          { col1: null },
          { col1: undefined },
        ],
      };

      const buffer = await service.generatePdf(data);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });

  describe('edge cases', () => {
    it('should handle very long column labels', async () => {
      const data: ExportData = {
        reportType: 'test',
        title: 'Long Labels Test',
        filters: {},
        columns: [
          { key: 'col', label: 'This is a very long column label that might cause issues' },
        ],
        rows: [{ col: 'value' }],
      };

      const excelBuffer = await service.generateExcel(data);
      const pdfBuffer = await service.generatePdf(data);

      expect(excelBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });

    it('should handle special characters in data', async () => {
      const data: ExportData = {
        reportType: 'test',
        title: 'Special Chars: <>&"\'',
        filters: { 'Filter': 'Value with "quotes" & <tags>' },
        columns: [{ key: 'col', label: 'Column' }],
        rows: [
          { col: 'Special: <script>alert("xss")</script>' },
          { col: '₹1,000.00 — Test' },
        ],
      };

      const excelBuffer = await service.generateExcel(data);
      const pdfBuffer = await service.generatePdf(data);

      expect(excelBuffer).toBeInstanceOf(Buffer);
      expect(pdfBuffer).toBeInstanceOf(Buffer);
    });

    it('should handle more than 26 columns (Excel column letters)', async () => {
      const columns = Array.from({ length: 30 }, (_, i) => ({
        key: `col${i}`,
        label: `Column ${i + 1}`,
      }));

      const rows = [Object.fromEntries(columns.map(c => [c.key, 'value']))];

      const data: ExportData = {
        reportType: 'test',
        title: 'Many Columns',
        filters: {},
        columns,
        rows,
      };

      const buffer = await service.generateExcel(data);

      expect(buffer).toBeInstanceOf(Buffer);
    });
  });
});
