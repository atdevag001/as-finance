import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

export interface CreateAuditLogData {
  action_type: string;
  actor_id: string;
  actor_role: string;
  target_entity: string;
  target_id: string;
  ip_address: string;
  request_id: string;
  before_state?: unknown;
  after_state?: unknown;
  remarks?: string;
  approval_id?: string;
}

export interface AuditLogQueryParams {
  skip?: number;
  take?: number;
  targetEntity?: string;
  targetId?: string;
  actorId?: string;
  actionType?: string;
  startDate?: Date;
  endDate?: Date;
}

// Bare select for create() — list reads include the actor relation for the UI.
const AUDIT_LOG_SELECT = {
  id: true,
  action_type: true,
  actor_id: true,
  actor_role: true,
  target_entity: true,
  target_id: true,
  ip_address: true,
  request_id: true,
  before_state: true,
  after_state: true,
  remarks: true,
  approval_id: true,
  created_at: true,
};

// Joins actor user so the audit viewer can show a human name instead of a UUID.
const AUDIT_LOG_LIST_SELECT = {
  ...AUDIT_LOG_SELECT,
  actor: { select: { id: true, full_name: true, email: true } },
};

@Injectable()
export class AuditRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create an audit log entry. Accepts an optional Prisma transaction client
   * so the audit record is written within the same transaction as the
   * finance-affecting operation.
   *
   * Append-only: this repository intentionally exposes NO update or delete methods.
   */
  async create(data: CreateAuditLogData, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return (client)['audit_logs'].create({
      data: data as never,
      select: AUDIT_LOG_SELECT,
    });
  }

  /**
   * Query audit logs with filtering and pagination.
   */
  async findAll(params: AuditLogQueryParams) {
    const where: Record<string, unknown> = {};

    if (params.targetEntity) {
      where['target_entity'] = params.targetEntity;
    }
    if (params.targetId) {
      where['target_id'] = params.targetId;
    }
    if (params.actorId) {
      where['actor_id'] = params.actorId;
    }
    if (params.actionType) {
      where['action_type'] = params.actionType;
    }
    if (params.startDate || params.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (params.startDate) dateFilter['gte'] = params.startDate;
      if (params.endDate) dateFilter['lte'] = params.endDate;
      where['created_at'] = dateFilter;
    }

    const [data, total] = await Promise.all([
      this.prisma['audit_logs'].findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 50,
        orderBy: { created_at: 'desc' },
        select: AUDIT_LOG_LIST_SELECT,
      }),
      this.prisma['audit_logs'].count({ where }),
    ]);

    return { data, total };
  }
}
