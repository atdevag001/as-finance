import { AuditAction, UserRole } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

/**
 * AuditLogEntry — represents an append-only audit log record.
 * Maps to `audit_logs` Prisma model fields.
 */
export interface AuditLogEntry {
  id: string;
  actionType: AuditAction;
  actorId: string;
  actorRole: UserRole;
  targetEntity: string;
  targetId: string;
  ipAddress: string;
  requestId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  remarks: string | null;
  approvalId: string | null;
  createdAt: Date;
}

export function buildAuditLogEntry(
  overrides?: Partial<AuditLogEntry>,
): AuditLogEntry {
  return buildEntity<AuditLogEntry>(
    {
      id: randomUUID(),
      actionType: AuditAction.COLLECTION_POSTED,
      actorId: randomUUID(),
      actorRole: UserRole.COLLECTION_OFFICER,
      targetEntity: 'collection',
      targetId: randomUUID(),
      ipAddress: '127.0.0.1',
      requestId: randomUUID(),
      beforeState: null,
      afterState: null,
      remarks: null,
      approvalId: null,
      createdAt: new Date(),
    },
    overrides,
  );
}
