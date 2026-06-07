import { Module } from '@nestjs/common';
import { CashbookService } from './cashbook.service';
import { CashbookController } from './cashbook.controller';
import { CashbookRepository } from './cashbook.repository';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [AccountingModule, AuditModule, IdempotencyModule],
  controllers: [CashbookController],
  providers: [CashbookService, CashbookRepository],
  exports: [CashbookService],
})
export class CashbookModule {}
