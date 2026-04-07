import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DocumentModule } from './modules/document/document.module';
import { LoanProductModule } from './modules/loan-product/loan-product.module';
import { LoanModule } from './modules/loan/loan.module';
import { ScheduleModule } from './modules/schedule/schedule.module';
import { AuditModule } from './modules/audit/audit.module';
import { AccountingModule } from './modules/accounting/accounting.module';
import { IdempotencyModule } from './modules/idempotency/idempotency.module';
import { ReceiptModule } from './modules/receipt/receipt.module';
import { DisbursementModule } from './modules/disbursement/disbursement.module';
import { CollectionModule } from './modules/collection/collection.module';
import { ReversalModule } from './modules/reversal/reversal.module';
import { PenaltyModule } from './modules/penalty/penalty.module';
import { ForeclosureModule } from './modules/foreclosure/foreclosure.module';
import { GroupModule } from './modules/group/group.module';
import { CashbookModule } from './modules/cashbook/cashbook.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ReportModule } from './modules/report/report.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';

@Module({
  imports: [
    // Rate limiting: default 100 req/min per user, auth endpoints override to 10/min per IP
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UserModule,
    CustomerModule,
    DocumentModule,
    LoanProductModule,
    LoanModule,
    ScheduleModule,
    AuditModule,
    AccountingModule,
    IdempotencyModule,
    ReceiptModule,
    DisbursementModule,
    CollectionModule,
    ReversalModule,
    PenaltyModule,
    ForeclosureModule,
    GroupModule,
    CashbookModule,
    NotificationModule,
    SettingsModule,
    ReportModule,
    DashboardModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env['NODE_ENV'] !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: process.env['NODE_ENV'] === 'test' ? 'silent' : 'info',
        autoLogging: true,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'body.password',
            'body.currentPassword',
            'body.newPassword',
            'body.aadhaarNumber',
            'body.panNumber',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule {}
