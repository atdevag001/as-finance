import { Module, OnModuleInit } from '@nestjs/common';
import { ExcelModule } from '../excel/excel.module';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../../database/database.module';
import { SettingsModule } from '../settings/settings.module';
import { LoanProductModule } from '../loan-product/loan-product.module';
import { ImportService } from './import.service';
import { ImportController } from './import.controller';
import { HolidayImporter } from './domains/holiday-importer';
import { SettingsImporter } from './domains/settings-importer';
import { LoanProductImporter } from './domains/loan-product-importer';

@Module({
  imports: [ExcelModule, AuditModule, DatabaseModule, SettingsModule, LoanProductModule],
  controllers: [ImportController],
  providers: [ImportService, HolidayImporter, SettingsImporter, LoanProductImporter],
  exports: [ImportService],
})
export class ImportModule implements OnModuleInit {
  constructor(
    private readonly service: ImportService,
    private readonly holidays: HolidayImporter,
    private readonly settings: SettingsImporter,
    private readonly products: LoanProductImporter,
  ) {}

  onModuleInit(): void {
    // Register all domain importers at boot.
    this.service.registerImporter(this.holidays);
    this.service.registerImporter(this.settings);
    this.service.registerImporter(this.products);
  }
}
