import { Module, forwardRef } from '@nestjs/common';
import { DisbursementService } from './disbursement.service';
import { DisbursementController } from './disbursement.controller';
import { DisbursementRepository } from './disbursement.repository';
import { LoanModule } from '../loan/loan.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [forwardRef(() => LoanModule), AccountingModule, AuditModule, IdempotencyModule, SettingsModule],
  controllers: [DisbursementController],
  providers: [DisbursementService, DisbursementRepository],
  exports: [DisbursementService],
})
export class DisbursementModule {}
