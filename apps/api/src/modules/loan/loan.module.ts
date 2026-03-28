import { Module } from '@nestjs/common';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { LoanRepository } from './loan.repository';

@Module({
  controllers: [LoanController],
  providers: [LoanService, LoanRepository],
  exports: [LoanService],
})
export class LoanModule {}
