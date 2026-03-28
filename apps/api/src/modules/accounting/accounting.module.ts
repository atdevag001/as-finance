import { Module } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { AccountingRepository } from './accounting.repository';

@Module({
  controllers: [AccountingController],
  providers: [AccountingService, AccountingRepository],
  exports: [AccountingService, AccountingRepository],
})
export class AccountingModule {}
