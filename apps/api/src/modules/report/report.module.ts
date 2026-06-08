import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { ReportRepository } from './report.repository';
import { ReportExportService } from './report-export.service';
import { ExcelModule } from '../excel/excel.module';

@Module({
  imports: [ExcelModule],
  controllers: [ReportController],
  providers: [ReportService, ReportRepository, ReportExportService],
  exports: [ReportService],
})
export class ReportModule {}
