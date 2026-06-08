import { Module } from '@nestjs/common';
import { ExcelModule } from '../excel/excel.module';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../../database/database.module';
import { CustomerModule } from '../customer/customer.module';
import { LoanModule } from '../loan/loan.module';
import { LoanProductModule } from '../loan-product/loan-product.module';
import { CollectionModule } from '../collection/collection.module';
import { GroupModule } from '../group/group.module';
import { SettingsModule } from '../settings/settings.module';
import { ExportsController } from './exports.controller';
import { ExportsService } from './exports.service';

@Module({
  imports: [
    ExcelModule,
    AuditModule,
    DatabaseModule,
    CustomerModule,
    LoanModule,
    LoanProductModule,
    CollectionModule,
    GroupModule,
    SettingsModule,
  ],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
