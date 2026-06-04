import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { CsrfGuard } from './common/guards/csrf.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './modules/crypto/crypto.module';
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
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: process.env['NODE_ENV'] === 'test' ? 10000 : 1000,
      },
      {
        name: 'login',
        ttl: 60_000,
        limit: process.env['NODE_ENV'] === 'test' ? 1000 : 5,
      },
      {
        name: 'refresh',
        ttl: 60_000,
        limit: process.env['NODE_ENV'] === 'test' ? 1000 : 10,
      },
      {
        name: 'changePassword',
        ttl: 60_000,
        limit: process.env['NODE_ENV'] === 'test' ? 1000 : 5,
      },
    ]),
    DatabaseModule,
    CryptoModule,
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
            'body.mobile',
            'body.address',
            'body.dob',
            'body.income',
            'body.monthlyIncomePaise',
            'body.guarantor',
            'body.familyMembers',
            'body.dependents',
            'body.referenceContact',
            'body.permanentAddress',
            'body.currentAddress',
          ],
          censor: '[REDACTED]',
        },
      },
    }),
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    // Global JWT guard — forces every endpoint to require authentication unless
    // explicitly opted out with @Public(). Closes "auth opt-in" gap.
    // MUST run before CustomThrottlerGuard so req.user is populated for
    // per-user throttling (otherwise throttler degrades to IP-only).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // CSRF double-submit-cookie defense — registered AFTER JwtAuthGuard so
    // the @Public() check on auth endpoints continues to work.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: CustomThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
