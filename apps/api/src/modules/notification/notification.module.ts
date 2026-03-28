import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { OutboxProcessor } from './outbox-processor';
import { SMS_PROVIDER, MockSmsProvider } from './sms-provider';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    OutboxProcessor,
    {
      provide: SMS_PROVIDER,
      useClass: MockSmsProvider,
    },
  ],
  exports: [NotificationService],
})
export class NotificationModule {}
