import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ImportService } from './import.service';
import { CommitImportDto } from './dto/commit-import.dto';
import type { ImportDomain } from './types';
import { MAX_IMPORT_FILE_BYTES } from '../excel/types';

type AuthedReq = { user: { sub: string; role: string } };

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const UPLOAD_OPTIONS = {
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (err: Error | null, ok: boolean) => void) => {
    const ok =
      file.mimetype === XLSX_MIME ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/octet-stream' || // some browsers send this for .xlsx
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.originalname.toLowerCase().endsWith('.csv');
    cb(ok ? null : new BadRequestException('Only .xlsx and .csv files are allowed'), ok);
  },
};

function assertDomain(domain: string): ImportDomain {
  if (domain === 'holidays' || domain === 'settings' || domain === 'loan-products') return domain;
  throw new BadRequestException(
    `Unknown import domain '${domain}'. Allowed: holidays, settings, loan-products`,
  );
}

@ApiTags('imports')
@Controller('imports')
export class ImportController {
  constructor(private readonly imports: ImportService) {}

  @Get(':domain/template.xlsx')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Header('Content-Type', XLSX_MIME)
  @RequirePermission('settings.import')
  @ApiOperation({ summary: 'Download an empty Excel template for a given import domain' })
  async template(@Param('domain') domain: string, @Res() res: Response): Promise<void> {
    const dom = assertDomain(domain);
    const buffer = await this.imports.generateTemplate(dom);
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Content-Disposition', `attachment; filename="${dom}-template.xlsx"`);
    res.send(buffer);
  }

  @Post(':domain/dry-run')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(FileInterceptor('file', UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @RequirePermission('settings.import')
  @ApiOperation({ summary: 'Validate an uploaded file and return a preview — no DB writes' })
  @ApiResponse({ status: 200, description: 'Dry-run result with preview' })
  async dryRun(
    @Param('domain') domain: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: AuthedReq,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const dom = assertDomain(domain);
    return this.imports.dryRun(
      dom,
      { buffer: file.buffer, originalname: file.originalname, size: file.size },
      { id: req.user.sub, role: req.user.role },
    );
  }

  @Post(':domain/commit')
  @Throttle({ default: { ttl: 60 * 60_000, limit: 10 } })
  @RequirePermission('settings.import')
  @ApiOperation({ summary: 'Commit a previously dry-run draft' })
  async commit(
    @Param('domain') domain: string,
    @Body() body: CommitImportDto,
    @Req() req: AuthedReq,
  ) {
    const dom = assertDomain(domain);
    return this.imports.commit(
      dom,
      body.importId,
      { id: req.user.sub, role: req.user.role },
      { strict: body.strict },
    );
  }
}
