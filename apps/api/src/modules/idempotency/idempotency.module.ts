import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { IdempotencyService } from './idempotency.service';

@Module({
  // ScheduleModule.forRoot() binds the @Cron handler on cleanupExpired()
  // so the idempotency_keys table is actually purged hourly.
  imports: [ScheduleModule.forRoot()],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
