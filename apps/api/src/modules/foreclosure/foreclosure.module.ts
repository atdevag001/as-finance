import { Module } from '@nestjs/common';
import { ForeclosureService } from './foreclosure.service';
import { ForeclosureController } from './foreclosure.controller';
import { ForeclosureRepository } from './foreclosure.repository';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ReceiptModule } from '../receipt/receipt.module';

@Module({
  imports: [AccountingModule, AuditModule, IdempotencyModule, ReceiptModule],
  controllers: [ForeclosureController],
  providers: [ForeclosureService, ForeclosureRepository],
  exports: [ForeclosureService],
})
export class ForeclosureModule {}
