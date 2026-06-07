import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient<{
    errorFormat: 'minimal';
    log: [
      { emit: 'event'; level: 'error' },
      { emit: 'event'; level: 'warn' },
    ];
  }>
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // errorFormat: 'minimal' strips failing query text & parameter values from error messages,
    // preventing PII (aadhaar, mobile, email) from leaking into structured logs.
    super({
      errorFormat: 'minimal',
      log: [
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });

    this.$on('error', (event: Prisma.LogEvent) => {
      this.logger.error(event.message, { target: event.target });
    });
    this.$on('warn', (event: Prisma.LogEvent) => {
      this.logger.warn(event.message, { target: event.target });
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
