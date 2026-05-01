import { Controller, Get, Param, Query, Req, Res, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { ReportService, REPORT_TYPES } from './report.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

interface AuthenticatedRequest extends Request {
  user: { sub: string; role: string };
}

/**
 * Report controller — serves all 20 report types via a single parameterized endpoint.
 *
 * Rate limiting: 5 report generations per minute per user.
 *
 * RBAC: report.read for viewing, report.export for exporting.
 */
@ApiTags('reports')
@Controller('reports')
@Throttle({ default: { ttl: 60_000, limit: 5 } }) // 5 report generations/min per user
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  /** List all available report types. */
  @Get()
  @RequirePermission('report.read')
  @ApiOperation({ summary: 'List available report types' })
  @ApiResponse({ status: 200, description: 'List of report type identifiers' })
  listReportTypes() {
    return {
      reportTypes: REPORT_TYPES.map((type) => ({
        id: type,
        name: type
          .split('-')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' '),
      })),
    };
  }

  /**
   * Generate a report by type.
   * RBAC scope filters are applied automatically based on the user's role.
   */
  @Get(':reportType')
  @RequirePermission('report.read')
  @ApiOperation({ summary: 'Generate a report by type' })
  @ApiParam({
    name: 'reportType',
    description: 'Report type identifier',
    enum: [...REPORT_TYPES],
  })
  @ApiQuery({ name: 'startDate', required: false, description: 'ISO 8601 start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'ISO 8601 end date' })
  @ApiQuery({ name: 'asOfDate', required: false, description: 'ISO 8601 as-of date (for balance sheet, trial balance)' })
  @ApiQuery({ name: 'officerId', required: false, description: 'Filter by officer ID' })
  @ApiQuery({ name: 'bucket', required: false, description: 'Overdue bucket filter' })
  @ApiQuery({ name: 'status', required: false, description: 'Loan status filter' })
  @ApiQuery({ name: 'productVersionId', required: false, description: 'Product version filter' })
  @ApiQuery({ name: 'loanId', required: false, description: 'Specific loan ID' })
  @ApiResponse({ status: 200, description: 'Report data' })
  @ApiResponse({ status: 404, description: 'Unknown report type' })
  async generateReport(
    @Param('reportType') reportType: string,
    @Query() query: Record<string, string>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.reportService.generateReport(reportType, query, req.user);
  }

  /**
   * Export a report in the specified format (PDF or XLSX).
   * Returns binary file with appropriate Content-Type header.
   */
  @Get(':reportType/export')
  @RequirePermission('report.export')
  @ApiOperation({ summary: 'Export a report as PDF or Excel file' })
  @ApiParam({
    name: 'reportType',
    description: 'Report type identifier',
    enum: [...REPORT_TYPES],
  })
  @ApiQuery({ name: 'format', required: true, description: 'Export format: pdf, xlsx' })
  @ApiResponse({ status: 200, description: 'Binary file download' })
  @ApiResponse({ status: 404, description: 'Unknown report type or format' })
  async exportReport(
    @Param('reportType') reportType: string,
    @Query('format') format: string,
    @Query() query: Record<string, string>,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { buffer, mimeType, filename } = await this.reportService.exportReport(
      reportType,
      format,
      query,
      req.user,
    );

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });

    return new StreamableFile(buffer);
  }
}
