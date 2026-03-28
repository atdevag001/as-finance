import { Module } from '@nestjs/common';
import { ReceiptService } from './receipt.service';
import { ReceiptController } from './receipt.controller';
import { ReceiptRepository } from './receipt.repository';

@Module({
  controllers: [ReceiptController],
  providers: [ReceiptService, ReceiptRepository],
  exports: [ReceiptService],
})
export class ReceiptModule {}
