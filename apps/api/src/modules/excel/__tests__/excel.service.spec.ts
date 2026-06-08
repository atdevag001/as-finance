import { describe, it, expect } from 'vitest';
import * as ExcelJS from 'exceljs';
import { ExcelService } from '../excel.service';
import type { ExportColumn, ImportColumnSchema } from '../types';

describe('ExcelService.exportToBuffer', () => {
  const svc = new ExcelService();

  it('writes a header row and data rows', async () => {
    const cols: ExportColumn[] = [
      { key: 'name', label: 'Name', type: 'string' },
      { key: 'amount_paise', label: 'Amount', type: 'currency' },
    ];
    const rows = [
      { name: 'Ravi', amount_paise: 50000 },
      { name: 'Asha', amount_paise: 75000 },
    ];
    const buf = await svc.exportToBuffer(cols, rows, { title: 'Test' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Buffer);
    const sheet = wb.worksheets[0]!;
    // Title row (1), data starts at row 4 (after title + empty + header)
    // Row layout: 1=title, 2=blank, 3=header, 4+ data
    expect(sheet.getRow(3).getCell(1).value).toBe('Name');
    expect(sheet.getRow(3).getCell(2).value).toBe('Amount');
    expect(sheet.getRow(4).getCell(1).value).toBe('Ravi');
    // Currency: paise / 100
    expect(sheet.getRow(4).getCell(2).value).toBe(500);
  });

  it('masks Aadhaar by default and unmasks when opts.unmaskPii=true', async () => {
    const cols: ExportColumn[] = [
      { key: 'aadhaar', label: 'Aadhaar', type: 'string', mask: 'aadhaar' },
    ];
    const rows = [{ aadhaar: '123456781234' }];

    const masked = await svc.exportToBuffer(cols, rows, { title: 't' });
    const wbA = new ExcelJS.Workbook();
    await wbA.xlsx.load(masked as unknown as Buffer);
    expect(wbA.worksheets[0]!.getRow(4).getCell(1).value).toBe('XXXX XXXX 1234');

    const unmasked = await svc.exportToBuffer(cols, rows, { title: 't', unmaskPii: true });
    const wbB = new ExcelJS.Workbook();
    await wbB.xlsx.load(unmasked as unknown as Buffer);
    expect(wbB.worksheets[0]!.getRow(4).getCell(1).value).toBe('123456781234');
  });

  it('masks mobile to last 4 digits', async () => {
    const cols: ExportColumn[] = [
      { key: 'mobile', label: 'Mobile', type: 'string', mask: 'mobile' },
    ];
    const buf = await svc.exportToBuffer(cols, [{ mobile: '9876543210' }], { title: 't' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as Buffer);
    expect(wb.worksheets[0]!.getRow(4).getCell(1).value).toBe('XXXXXX3210');
  });

  it('rejects an empty column array', async () => {
    await expect(svc.exportToBuffer([], [], { title: 't' })).rejects.toThrow();
  });
});

describe('ExcelService.parseToRows', () => {
  const svc = new ExcelService();

  async function buildXlsx(headers: string[], rows: (string | number)[][]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('s');
    sheet.addRow(headers);
    for (const r of rows) sheet.addRow(r);
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  it('parses valid rows and reports per-cell errors', async () => {
    const schema: ImportColumnSchema[] = [
      { key: 'date', type: 'date', required: true },
    ];
    const buf = await buildXlsx(['date'], [['2027-01-26'], ['not a date'], ['2027-08-15']]);
    const result = await svc.parseToRows<{ date: string }>(buf, schema, { filename: 't.xlsx' });
    expect(result.totalRows).toBe(3);
    expect(result.validRows.length).toBe(2);
    expect(result.validRows[0]).toEqual({ date: '2027-01-26' });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]!.column).toBe('date');
    expect(result.errors[0]!.rowIndex).toBe(2);
  });

  it('rejects when required column is missing', async () => {
    const schema: ImportColumnSchema[] = [{ key: 'date', type: 'date', required: true }];
    const buf = await buildXlsx(['something_else'], [['x']]);
    await expect(svc.parseToRows(buf, schema, { filename: 't.xlsx' })).rejects.toThrow(
      /Missing required columns/,
    );
  });

  it('respects a custom validator', async () => {
    const schema: ImportColumnSchema[] = [
      {
        key: 'level',
        type: 'string',
        validate: (v) => (v === 'high' || v === 'low' ? null : "Must be 'high' or 'low'"),
      },
    ];
    const buf = await buildXlsx(['level'], [['high'], ['nope']]);
    const result = await svc.parseToRows<{ level: string }>(buf, schema, { filename: 't.xlsx' });
    expect(result.validRows).toEqual([{ level: 'high' }]);
    expect(result.errors[0]!.message).toContain('high');
  });

  it('rejects oversized files', async () => {
    const big = Buffer.alloc(6 * 1024 * 1024); // 6 MB
    const schema: ImportColumnSchema[] = [{ key: 'x', type: 'string' }];
    await expect(svc.parseToRows(big, schema, { filename: 'big.xlsx' })).rejects.toThrow(
      /limit is/,
    );
  });
});
