import { Module, forwardRef } from '@nestjs/common';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { LoanRepository } from './loan.repository';
import { DisbursementModule } from '../disbursement/disbursement.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [forwardRef(() => DisbursementModule), SettingsModule],
  controllers: [LoanController],
  providers: [LoanService, LoanRepository],
  exports: [LoanService],
})
export class LoanModule {}
