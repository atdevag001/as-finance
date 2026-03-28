import { Module } from '@nestjs/common';
import { CollectionService } from './collection.service';
import { CollectionController } from './collection.controller';
import { CollectionRepository } from './collection.repository';
import { LoanModule } from '../loan/loan.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { ReceiptModule } from '../receipt/receipt.module';

@Module({
  imports: [LoanModule, AccountingModule, AuditModule, IdempotencyModule, ReceiptModule],
  controllers: [CollectionController],
  providers: [CollectionService, CollectionRepository],
  exports: [CollectionService, CollectionRepository],
})
export class CollectionModule {}
