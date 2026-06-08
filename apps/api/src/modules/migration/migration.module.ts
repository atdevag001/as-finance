import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { CryptoModule } from '../crypto/crypto.module';
import { AuditModule } from '../audit/audit.module';
import { SettingsModule } from '../settings/settings.module';
import { ExcelModule } from '../excel/excel.module';
import { MigrationController } from './migration.controller';
import { MigrationService } from './migration.service';

@Module({
  imports: [DatabaseModule, CryptoModule, AuditModule, SettingsModule, ExcelModule],
  controllers: [MigrationController],
  providers: [MigrationService],
})
export class MigrationModule {}
