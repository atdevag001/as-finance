import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsUUID } from 'class-validator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { MAX_IMPORT_FILE_BYTES } from '../excel/types';
import { MigrationService } from './migration.service';
import type { MigrationDomain } from './migration.types';

type AuthedReq = { user: { sub: string; role: string } };

class CommitMigrationDto {
  @IsUUID()
  draftId!: string;
}

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const FILE_FIELDS = [
  { name: 'customers', maxCount: 1 },
  { name: 'groups', maxCount: 1 },
  { name: 'group_members', maxCount: 1 },
  { name: 'loans', maxCount: 1 },
  { name: 'collections', maxCount: 1 },
];

const UPLOAD_OPTIONS = {
  limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 5 },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fileFilter: (_req: any, file: Express.Multer.File, cb: (err: Error | null, ok: boolean) => void) => {
    const ok =
      file.mimetype === XLSX_MIME ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/octet-stream' ||
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.originalname.toLowerCase().endsWith('.csv');
    cb(ok ? null : new BadRequestException('Only .xlsx and .csv files are allowed'), ok);
  },
};

@ApiTags('migration')
@Controller('migration')
export class MigrationController {
  constructor(private readonly migration: MigrationService) {}

  @Get('state')
  @RequirePermission('migration.read')
  @ApiOperation({ summary: 'Return current migration lock state' })
  async state() {
    return this.migration.getState();
  }

  @Post('dry-run')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseInterceptors(FileFieldsInterceptor(FILE_FIELDS, UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @RequirePermission('migration.run')
  @ApiOperation({ summary: 'Validate the uploaded migration files without writing anything' })
  async dryRun(
    @UploadedFiles()
    files: Partial<Record<MigrationDomain, Express.Multer.File[]>>,
    @Req() req: AuthedReq,
  ) {
    const flat: Partial<Record<MigrationDomain, { buffer: Buffer; originalname: string }>> = {};
    for (const domain of ['customers', 'groups', 'group_members', 'loans', 'collections'] as const) {
      const f = files[domain]?.[0];
      if (f) flat[domain] = { buffer: f.buffer, originalname: f.originalname };
    }
    if (Object.keys(flat).length === 0) {
      throw new BadRequestException('At least one file must be uploaded');
    }
    return this.migration.dryRun(flat, { id: req.user.sub, role: req.user.role });
  }

  @Post('commit')
  @Throttle({ default: { ttl: 60 * 60_000, limit: 3 } })
  @RequirePermission('migration.run')
  @ApiOperation({ summary: 'Commit a validated migration draft — one-shot lock applies' })
  async commit(@Body() body: CommitMigrationDto, @Req() req: AuthedReq) {
    return this.migration.commit(body.draftId, { id: req.user.sub, role: req.user.role });
  }
}
