import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { DocumentService, UploadDocumentDto } from './document.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';

@ApiTags('documents')
@Controller('documents')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Post('upload')
  @RequirePermission('customer.upload_doc')
  @Throttle({ default: { ttl: 60_000, limit: 20 } }) // 20 uploads/min per user
  @UseInterceptors(FileInterceptor('file'))
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
    const url = await this.documentService.getSignedUrl(id, req.user.sub);
    return { data: { url } };
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
    await this.documentService.softDelete(id, req.user.sub);
  }
}
