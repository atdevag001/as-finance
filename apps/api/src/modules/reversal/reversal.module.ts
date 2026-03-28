import { Module } from '@nestjs/common';
import { ReversalService } from './reversal.service';
import { ReversalController } from './reversal.controller';
import { CollectionModule } from '../collection/collection.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ReceiptModule } from '../receipt/receipt.module';

@Module({
  imports: [CollectionModule, AccountingModule, AuditModule, IdempotencyModule, ReceiptModule],
  controllers: [ReversalController],
  providers: [ReversalService],
  exports: [ReversalService],
})
export class ReversalModule {}
