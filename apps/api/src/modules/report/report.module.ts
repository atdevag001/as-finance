import { Module } from '@nestjs/common';
import { ReportService } from './report.service';
import { ReportController } from './report.controller';
import { ReportRepository } from './report.repository';

@Module({
  controllers: [ReportController],
  providers: [ReportService, ReportRepository],
  exports: [ReportService],
})
export class ReportModule {}
