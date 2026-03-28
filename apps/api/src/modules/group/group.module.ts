import { Module } from '@nestjs/common';
import { GroupService } from './group.service';
import { GroupController } from './group.controller';
import { GroupRepository } from './group.repository';
import { CollectionModule } from '../collection/collection.module';
import { AuditModule } from '../audit/audit.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [CollectionModule, AuditModule, IdempotencyModule],
  controllers: [GroupController],
  providers: [GroupService, GroupRepository],
  exports: [GroupService],
})
export class GroupModule {}
