import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

export interface ExportColumn {
  key: string;
  label: string;
  type?: 'currency' | 'date' | 'number' | 'string';
}

export interface ExportData {
  reportType: string;
  title: string;
  filters: Record<string, string>;
  summary?: Record<string, unknown>;
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
}

@Injectable()
export class ReportExportService {
  /**
   * Generate Excel file from report data.
   * Returns Buffer containing XLSX file.
   */
  async generateExcel(data: ExportData): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'AS Finance';
    workbook.created = new Date();

    // Sanitize worksheet name (Excel restrictions: no * ? : \ / [ ], no ' at start/end, max 31 chars)
    const sheetName = (data.title || 'Report')
      .replace(/[*?:\\/\[\]<>&"]/g, '')
      .replace(/^'+|'+$/g, '')
      .substring(0, 31)
      .trim() || 'Report';
    const sheet = workbook.addWorksheet(sheetName);

    // Title row
    sheet.mergeCells('A1', `${this.colLetter(data.columns.length)}1`);
    const titleCell = sheet.getCell('A1');
    titleCell.value = data.title || data.reportType;
    titleCell.font = { bold: true, size: 16 };
    titleCell.alignment = { horizontal: 'center' };

    // Filters row
    let currentRow = 2;
    if (data.filters && Object.keys(data.filters).length > 0) {
      const filterText = Object.entries(data.filters)
        .map(([k, v]) => `${k}: ${v}`)
        .join(' | ');
      sheet.mergeCells(`A${currentRow}`, `${this.colLetter(data.columns.length)}${currentRow}`);
      const filterCell = sheet.getCell(`A${currentRow}`);
      filterCell.value = filterText;
      filterCell.font = { italic: true, size: 10 };
      currentRow++;
    }

    // Summary row
    if (data.summary && Object.keys(data.summary).length > 0) {
      const summaryText = Object.entries(data.summary)
        .filter(([, v]) => typeof v !== 'object')
        .map(([k, v]) => `${this.formatLabel(k)}: ${this.formatValue(v, k)}`)
        .join(' | ');
      sheet.mergeCells(`A${currentRow}`, `${this.colLetter(data.columns.length)}${currentRow}`);
      const summaryCell = sheet.getCell(`A${currentRow}`);
      summaryCell.value = summaryText;
      summaryCell.font = { bold: true, size: 11 };
      currentRow++;
    }

    // Empty row before headers
    currentRow++;

    // Header row
    const headerRow = sheet.getRow(currentRow);
    data.columns.forEach((col, idx) => {
      const cell = headerRow.getCell(idx + 1);
      cell.value = col.label || this.formatLabel(col.key);
      cell.font = { bold: true };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' },
      };
      cell.border = {
        bottom: { style: 'thin' },
      };
    });
    currentRow++;

    // Data rows
    for (const row of data.rows) {
      const dataRow = sheet.getRow(currentRow);
      data.columns.forEach((col, idx) => {
        const cell = dataRow.getCell(idx + 1);
        const value = row[col.key];

        if (col.type === 'currency' || col.key.includes('Paise') || col.key.includes('paise')) {
          const numVal = typeof value === 'string' ? parseInt(value, 10) : (value as number);
          cell.value = numVal / 100;
          cell.numFmt = '₹#,##0.00';
        } else if (col.type === 'date' || col.key.includes('Date') || col.key.includes('date')) {
          cell.value = value ? new Date(value as string) : '';
          cell.numFmt = 'yyyy-mm-dd';
        } else if (col.type === 'number' || typeof value === 'number') {
          cell.value = value as number;
        } else {
          cell.value = value !== null && value !== undefined ? String(value) : '';
        }
      });
      currentRow++;
    }

    // Auto-fit columns
    data.columns.forEach((col, idx) => {
      const column = sheet.getColumn(idx + 1);
      let maxLength = col.label.length;
      data.rows.forEach((row) => {
        const val = row[col.key];
        const len = val !== null && val !== undefined ? String(val).length : 0;
        if (len > maxLength) maxLength = len;
      });
      column.width = Math.min(Math.max(maxLength + 2, 10), 40);
    });

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Generate PDF file from report data.
   * Returns Buffer containing PDF file.
   */
  async generatePdf(data: ExportData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Uint8Array[] = [];
      const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape', bufferPages: true });

      doc.on('data', (chunk: Uint8Array) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Title
      doc.fontSize(18).font('Helvetica-Bold').text(data.title || data.reportType, { align: 'center' });
      doc.moveDown(0.5);

      // Filters
      if (data.filters && Object.keys(data.filters).length > 0) {
        const filterText = Object.entries(data.filters)
          .map(([k, v]) => `${k}: ${v}`)
          .join(' | ');
        doc.fontSize(10).font('Helvetica-Oblique').text(filterText, { align: 'center' });
        doc.moveDown(0.3);
      }

      // Generated date
      doc.fontSize(8).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.moveDown(1);

      // Summary
      if (data.summary && Object.keys(data.summary).length > 0) {
        doc.fontSize(10).font('Helvetica-Bold').text('Summary:', { underline: true });
        doc.font('Helvetica');
        Object.entries(data.summary)
          .filter(([, v]) => typeof v !== 'object')
          .forEach(([k, v]) => {
            doc.text(`${this.formatLabel(k)}: ${this.formatValue(v, k)}`);
          });
        doc.moveDown(1);
      }

      // Table
      const tableTop = doc.y;
      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colCount = Math.min(data.columns.length, 10); // Limit columns for PDF
      const colWidth = pageWidth / colCount;

      // Table header
      doc.font('Helvetica-Bold').fontSize(9);
      let x = doc.page.margins.left;
      data.columns.slice(0, colCount).forEach((col) => {
        doc.text(col.label || this.formatLabel(col.key), x, tableTop, {
          width: colWidth - 5,
          align: 'left',
        });
        x += colWidth;
      });

      // Header underline
      doc.moveTo(doc.page.margins.left, tableTop + 15)
        .lineTo(doc.page.margins.left + pageWidth, tableTop + 15)
        .stroke();

      // Table rows
      doc.font('Helvetica').fontSize(8);
      let y = tableTop + 20;
      const rowHeight = 15;
      const maxRowsPerPage = Math.floor((doc.page.height - y - doc.page.margins.bottom) / rowHeight);

      data.rows.forEach((row, rowIdx) => {
        if (rowIdx > 0 && rowIdx % maxRowsPerPage === 0) {
          doc.addPage();
          y = doc.page.margins.top;
        }

        x = doc.page.margins.left;
        data.columns.slice(0, colCount).forEach((col) => {
          let value = row[col.key];

          if (col.type === 'currency' || col.key.includes('Paise') || col.key.includes('paise')) {
            const numVal = typeof value === 'string' ? parseInt(value as string, 10) : (value as number);
            value = `₹${(numVal / 100).toFixed(2)}`;
          }

          doc.text(
            value !== null && value !== undefined ? String(value).substring(0, 20) : '-',
            x, y,
            { width: colWidth - 5, align: 'left' }
          );
          x += colWidth;
        });
        y += rowHeight;
      });

      // Footer
      const pageCount = doc.bufferedPageRange().count;
      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).text(
          `Page ${i + 1} of ${pageCount}`,
          doc.page.margins.left,
          doc.page.height - 30,
          { align: 'center', width: pageWidth }
        );
      }

      doc.end();
    });
  }

  private colLetter(n: number): string {
    let result = '';
    while (n > 0) {
      n--;
      result = String.fromCharCode(65 + (n % 26)) + result;
      n = Math.floor(n / 26);
    }
    return result || 'A';
  }

  private formatLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/[_-]/g, ' ')
      .replace(/paise$/i, '')
      .trim()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private formatValue(value: unknown, key: string): string {
    if (value === null || value === undefined) return '-';
    if (key.toLowerCase().includes('paise')) {
      const num = typeof value === 'string' ? parseInt(value, 10) : (value as number);
      return `₹${(num / 100).toFixed(2)}`;
    }
    return String(value);
  }
}
