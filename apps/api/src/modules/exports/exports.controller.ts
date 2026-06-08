import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { PERMISSIONS } from '@as-finance/shared';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ExportsService, ExportFilters } from './exports.service';

type AuthedReq = { user: { sub: string; role: string } };

const EXPORT_THROTTLE = { exportLimit: { ttl: 60_000, limit: 5 } };

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('exports')
@Controller('exports')
export class ExportsController {
  constructor(private readonly service: ExportsService) {}

  // ────────────────────────────────────────────────────────────────────────────
  @Get('customers.xlsx')
  @Throttle(EXPORT_THROTTLE)
  @RequirePermission('customer.export')
  @Header('Content-Type', XLSX_MIME)
  @ApiOperation({ summary: 'Export customers list to Excel' })
  @ApiResponse({ status: 200, description: 'Excel file', content: { [XLSX_MIME]: {} } })
  async customers(
    @Req() req: AuthedReq,
    @Query('status') status: string | undefined,
    @Query('search') search: string | undefined,
    @Query('unmaskPii') unmaskPii: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const unmask = this.checkUnmask(req, unmaskPii);
    const { buffer, filename } = await this.service.exportCustomers({
      domain: 'customers',
      actorId: req.user.sub,
      actorRole: req.user.role,
      unmaskPii: unmask,
      filters: filterShape({ status, search }),
    });
    sendXlsx(res, buffer, filename);
  }

  @Get('loans.xlsx')
  @Throttle(EXPORT_THROTTLE)
  @RequirePermission('loan.export')
  @Header('Content-Type', XLSX_MIME)
  async loans(
    @Req() req: AuthedReq,
    @Query('status') status: string | undefined,
    @Query('productVersionId') productVersionId: string | undefined,
    @Query('search') search: string | undefined,
    @Query('unmaskPii') unmaskPii: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const unmask = this.checkUnmask(req, unmaskPii);
    const { buffer, filename } = await this.service.exportLoans({
      domain: 'loans',
      actorId: req.user.sub,
      actorRole: req.user.role,
      unmaskPii: unmask,
      filters: filterShape({ status, productVersionId, search }),
    });
    sendXlsx(res, buffer, filename);
  }

  @Get('loan-products.xlsx')
  @Throttle(EXPORT_THROTTLE)
  @RequirePermission('loan_product.export')
  @Header('Content-Type', XLSX_MIME)
  async loanProducts(@Req() req: AuthedReq, @Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.service.exportLoanProducts({
      domain: 'loan_products',
      actorId: req.user.sub,
      actorRole: req.user.role,
      unmaskPii: false,
      filters: {},
    });
    sendXlsx(res, buffer, filename);
  }

  @Get('collections.xlsx')
  @Throttle(EXPORT_THROTTLE)
  @RequirePermission('collection.export')
  @Header('Content-Type', XLSX_MIME)
  async collections(
    @Req() req: AuthedReq,
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('paymentMode') paymentMode: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.service.exportCollections({
      domain: 'collections',
      actorId: req.user.sub,
      actorRole: req.user.role,
      unmaskPii: false,
      filters: filterShape({ startDate, endDate, paymentMode }),
    });
    sendXlsx(res, buffer, filename);
  }

  @Get('groups.xlsx')
  @Throttle(EXPORT_THROTTLE)
  @RequirePermission('group.export')
  @Header('Content-Type', XLSX_MIME)
  async groups(
    @Req() req: AuthedReq,
    @Query('status') status: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.service.exportGroups({
      domain: 'groups',
      actorId: req.user.sub,
      actorRole: req.user.role,
      unmaskPii: false,
      filters: filterShape({ status }),
    });
    sendXlsx(res, buffer, filename);
  }

  @Get('settings.xlsx')
  @Throttle(EXPORT_THROTTLE)
  @RequirePermission('settings.export')
  @Header('Content-Type', XLSX_MIME)
  async settings(@Req() req: AuthedReq, @Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.service.exportSettings({
      domain: 'settings',
      actorId: req.user.sub,
      actorRole: req.user.role,
      unmaskPii: false,
      filters: {},
    });
    sendXlsx(res, buffer, filename);
  }

  @Get('holidays.xlsx')
  @Throttle(EXPORT_THROTTLE)
  @RequirePermission('settings.export')
  @Header('Content-Type', XLSX_MIME)
  async holidays(
    @Req() req: AuthedReq,
    @Query('year') year: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.service.exportHolidays({
      domain: 'holidays',
      actorId: req.user.sub,
      actorRole: req.user.role,
      unmaskPii: false,
      filters: filterShape({ year: year ? Number(year) : undefined }),
    });
    sendXlsx(res, buffer, filename);
  }

  // PII unmask is allowed only when (a) the user has the export.unmask_pii
  // permission AND (b) they explicitly opted in via the query string.
  private checkUnmask(req: AuthedReq, unmaskPii: string | undefined): boolean {
    if (unmaskPii !== 'true') return false;
    const allowed = (PERMISSIONS['export.unmask_pii'] ?? []) as readonly string[];
    if (!allowed.includes(req.user.role)) {
      throw new ForbiddenException('You are not allowed to export unmasked PII');
    }
    return true;
  }
}

function filterShape(input: Partial<ExportFilters>): ExportFilters {
  const out: ExportFilters = {};
  if (input.status) out.status = input.status;
  if (input.search) out.search = input.search;
  if (input.startDate) out.startDate = input.startDate;
  if (input.endDate) out.endDate = input.endDate;
  if (input.productVersionId) out.productVersionId = input.productVersionId;
  if (input.paymentMode) out.paymentMode = input.paymentMode;
  if (input.year) out.year = input.year;
  return out;
}

function sendXlsx(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader('Content-Type', XLSX_MIME);
  res.setHeader('Content-Length', String(buffer.length));
  // Filename is sanitized: we generate it server-side from a known set of slugs + dateStamp.
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}
