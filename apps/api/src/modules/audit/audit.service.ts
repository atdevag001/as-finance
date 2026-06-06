import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { AuditRepository, CreateAuditLogData } from './audit.repository';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { CreateAuditLogDto } from './dto/create-audit-log.dto';
import { getRequestId } from '../../common/middleware/request-id.middleware';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Audit service — append-only audit log management.
 *
 * Enforces append-only semantics: only create and read operations are exposed.
 * No update or delete methods exist by design (Requirement 17.4).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  /**
   * Create an audit log entry.
   *
   * Accepts an optional Prisma transaction client so the audit record is
   * written within the same transaction as the finance-affecting operation,
   * ensuring audit completeness (Requirement 17.6).
   *
   * Falls back to sensible defaults for ip_address and request_id when
   * not provided (e.g. background jobs).
   */
  async createAuditLog(dto: CreateAuditLogDto, tx?: TxClient) {
    const data: CreateAuditLogData = {
      action_type: dto.action_type,
      actor_id: dto.actor_id,
      actor_role: dto.actor_role,
      target_entity: dto.target_entity,
      target_id: dto.target_id,
      ip_address: dto.ip_address ?? '0.0.0.0',
      request_id: dto.request_id ?? getRequestId(),
      before_state: dto.before_state ?? undefined,
      after_state: dto.after_state ?? undefined,
      remarks: dto.remarks ?? undefined,
      approval_id: dto.approval_id ?? undefined,
    };

    const entry = await this.auditRepository.create(data, tx);

    this.logger.log({
      msg: 'Audit log created',
      actionType: dto.action_type,
      targetEntity: dto.target_entity,
      targetId: dto.target_id,
      actorId: dto.actor_id,
    });

    return entry;
  }

  /**
   * Query audit logs with filtering and pagination.
   * Restricted to manager, super_admin, viewer_auditor at the controller level.
   */
  async findAll(query: AuditLogQueryDto) {
    return this.auditRepository.findAll({
      skip: query.skip,
      take: query.take,
      targetEntity: query.targetEntity,
      targetId: query.targetId,
      actorId: query.actorId,
      actionType: query.actionType,
      startDate: parseBoundaryDate(query.startDate, 'start', query.tzOffsetMinutes),
      endDate: parseBoundaryDate(query.endDate, 'end', query.tzOffsetMinutes),
    });
  }
}

// Date-only inputs (YYYY-MM-DD) are interpreted in the client's local TZ, not UTC,
// otherwise the audit log filter would be off by the user's offset (e.g. 5h30m for IST).
function parseBoundaryDate(
  value: string | undefined,
  boundary: 'start' | 'end',
  tzOffsetMinutes: number | undefined,
): Date | undefined {
  if (!value) return undefined;
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!isDateOnly) return new Date(value);
  const offset = tzOffsetMinutes ?? 0;
  // Build UTC midnight, then shift by offset so the resulting instant equals
  // local midnight of the picked day; `end` advances to the start of the next day.
  const base = new Date(`${value}T00:00:00.000Z`);
  if (boundary === 'end') base.setUTCDate(base.getUTCDate() + 1);
  return new Date(base.getTime() + offset * 60_000);
}
