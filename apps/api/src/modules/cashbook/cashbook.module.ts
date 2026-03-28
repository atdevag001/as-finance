import { Module } from '@nestjs/common';
import { CashbookService } from './cashbook.service';
import { CashbookController } from './cashbook.controller';
import { CashbookRepository } from './cashbook.repository';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AccountingModule, AuditModule],
  controllers: [CashbookController],
  providers: [CashbookService, CashbookRepository],
  exports: [CashbookService],
})
export class CashbookModule {}
