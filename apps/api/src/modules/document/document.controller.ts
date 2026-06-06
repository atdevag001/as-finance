import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { DocumentService } from './document.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';
import { buildContentDisposition } from '../../common/utils/filename.util';

/**
 * H8 — Multer guardrails for document uploads.
 *
 * Enforces a 5 MB hard cap, a single-file ceiling, and a mimetype allowlist
 * BEFORE the file reaches DocumentService. This prevents oversized payloads
 * from being buffered into memory and stops disallowed types (executables,
 * archives, HTML) at the controller boundary.
 */
const DOCUMENT_UPLOAD_ALLOWED_MIMES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/pdf',
]);

const DOCUMENT_UPLOAD_OPTIONS = {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (err: Error | null, accept: boolean) => void,
  ) => {
    if (!DOCUMENT_UPLOAD_ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error('INVALID_MIME_TYPE'), false);
      return;
    }
    cb(null, true);
  },
};

@ApiTags('documents')
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @RequirePermission('customer.upload_doc')
  @Throttle({ default: { ttl: 60_000, limit: 20 } }) // 20 uploads/min per user
  @UseInterceptors(FileInterceptor('file', DOCUMENT_UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a document (JPEG, PNG, or PDF, max 5MB)' })
  @ApiResponse({ status: 201, description: 'Document uploaded' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const metadata = await this.documentService.upload(file, dto, req.user.sub);
    return { data: metadata };
  }

  @Get(':id/url')
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'Get a signed URL for a document (15-min expiry)' })
  @ApiResponse({ status: 200, description: 'Signed URL generated' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getSignedUrl(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    const url = await this.documentService.getSignedUrl(id, req.user.sub, req.user.role);
    return { data: { url } };
  }

  @Get(':id/download')
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'Download/view a document file (streamed)' })
  @ApiResponse({ status: 200, description: 'File streamed' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async downloadFile(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
    @Res() res: Response,
  ) {
    const { stream, metadata } = await this.documentService.getFileStream(id, req.user.sub, req.user.role);

    // H9 — original_filename is user-controlled. Interpolating it directly into
    // the Content-Disposition header allows CRLF / quote injection and filename
    // smuggling. Build the header via the central sanitizer so non-ASCII names
    // round-trip via RFC 5987 and dangerous characters are stripped.
    res.set({
      'Content-Type': metadata.mime_type,
      'Content-Length': metadata.size_bytes.toString(),
      'Cache-Control': 'private, max-age=900',
    });
    res.setHeader(
      'Content-Disposition',
      buildContentDisposition('inline', metadata.original_filename),
    );

    stream.on('error', (err) => {
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to stream file', error: err.message });
      } else {
        res.end();
      }
    });

    // Tear down the S3 stream if the client disconnects mid-download
    // (otherwise the upstream connection stays open until S3 times out).
    req.on('close', () => {
      if (!res.writableEnded) {
        stream.destroy();
      }
    });

    stream.pipe(res);
  }

  @Delete(':id')
  @RequirePermission('customer.upload_doc')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft delete a document' })
  @ApiResponse({ status: 204, description: 'Document soft deleted' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async softDelete(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    await this.documentService.softDelete(id, req.user.sub, req.user.role);
  }
}
