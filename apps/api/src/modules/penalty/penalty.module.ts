import { Module } from '@nestjs/common';
import { PenaltyService } from './penalty.service';
import { PenaltyController } from './penalty.controller';
import { PenaltyRepository } from './penalty.repository';
import { LoanModule } from '../loan/loan.module';
import { AccountingModule } from '../accounting/accounting.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [LoanModule, AccountingModule, AuditModule],
  controllers: [PenaltyController],
  providers: [PenaltyService, PenaltyRepository],
  exports: [PenaltyService],
})
export class PenaltyModule {}
