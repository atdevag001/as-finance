import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { S3StorageService } from './storage.service';

@Module({
  controllers: [DocumentController],
  providers: [DocumentService, S3StorageService],
  exports: [DocumentService, S3StorageService],
})
export class DocumentModule {}
