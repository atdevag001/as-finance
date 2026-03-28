import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from '../audit.service';
import { AuditRepository } from '../audit.repository';
import { CreateAuditLogDto } from '../dto/create-audit-log.dto';

describe('AuditService', () => {
  let service: AuditService;
  let repository: AuditRepository;

  const mockAuditLog = {
    id: '00000000-0000-0000-0000-000000000001',
    action_type: 'customer_created',
    actor_id: '00000000-0000-0000-0000-000000000010',
    actor_role: 'manager',
    target_entity: 'customer',
    target_id: '00000000-0000-0000-0000-000000000020',
    ip_address: '127.0.0.1',
    request_id: '00000000-0000-0000-0000-000000000099',
    before_state: null,
    after_state: { full_name: 'Test Customer' },
    remarks: null,
    approval_id: null,
    created_at: new Date('2024-01-15T10:00:00Z'),
  };

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(mockAuditLog),
      findAll: vi.fn().mockResolvedValue({ data: [mockAuditLog], total: 1 }),
    } as unknown as AuditRepository;

    service = new AuditService(repository);
  });

  describe('createAuditLog', () => {
    it('should create an audit log entry with all fields', async () => {
      const dto: CreateAuditLogDto = {
        action_type: 'customer_created',
        actor_id: '00000000-0000-0000-0000-000000000010',
        actor_role: 'manager',
        target_entity: 'customer',
        target_id: '00000000-0000-0000-0000-000000000020',
        ip_address: '127.0.0.1',
        request_id: '00000000-0000-0000-0000-000000000099',
        after_state: { full_name: 'Test Customer' },
      };

      const result = await service.createAuditLog(dto);

      expect(result).toEqual(mockAuditLog);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'customer_created',
          actor_id: dto.actor_id,
          actor_role: 'manager',
          target_entity: 'customer',
          target_id: dto.target_id,
          ip_address: '127.0.0.1',
          request_id: dto.request_id,
        }),
        undefined,
      );
    });

    it('should default ip_address to 0.0.0.0 when not provided', async () => {
      const dto: CreateAuditLogDto = {
        action_type: 'customer_created',
        actor_id: '00000000-0000-0000-0000-000000000010',
        actor_role: 'manager',
        target_entity: 'customer',
        target_id: '00000000-0000-0000-0000-000000000020',
      };

      await service.createAuditLog(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ ip_address: '0.0.0.0' }),
        undefined,
      );
    });

    it('should pass transaction client to repository when provided', async () => {
      const dto: CreateAuditLogDto = {
        action_type: 'loan_disbursed',
        actor_id: '00000000-0000-0000-0000-000000000010',
        actor_role: 'manager',
        target_entity: 'loan',
        target_id: '00000000-0000-0000-0000-000000000030',
        ip_address: '10.0.0.1',
        request_id: '00000000-0000-0000-0000-000000000088',
      };

      const mockTx = { audit_logs: { create: vi.fn() } };
      await service.createAuditLog(dto, mockTx as never);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({ action_type: 'loan_disbursed' }),
        mockTx,
      );
    });

    it('should include before_state and after_state when provided', async () => {
      const dto: CreateAuditLogDto = {
        action_type: 'customer_updated',
        actor_id: '00000000-0000-0000-0000-000000000010',
        actor_role: 'field_officer',
        target_entity: 'customer',
        target_id: '00000000-0000-0000-0000-000000000020',
        ip_address: '127.0.0.1',
        request_id: '00000000-0000-0000-0000-000000000099',
        before_state: { status: 'active' },
        after_state: { status: 'blacklisted' },
        remarks: 'Defaulted on multiple loans',
      };

      await service.createAuditLog(dto);

      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          before_state: { status: 'active' },
          after_state: { status: 'blacklisted' },
          remarks: 'Defaulted on multiple loans',
        }),
        undefined,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated audit logs', async () => {
      const result = await service.findAll({ skip: 0, take: 10 });

      expect(result).toEqual({ data: [mockAuditLog], total: 1 });
      expect(repository.findAll).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        targetEntity: undefined,
        targetId: undefined,
        actorId: undefined,
        actionType: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });

    it('should pass all filter parameters to repository', async () => {
      await service.findAll({
        skip: 0,
        take: 50,
        targetEntity: 'loan',
        targetId: '00000000-0000-0000-0000-000000000030',
        actorId: '00000000-0000-0000-0000-000000000010',
        actionType: 'loan_disbursed',
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-12-31T23:59:59Z',
      });

      expect(repository.findAll).toHaveBeenCalledWith({
        skip: 0,
        take: 50,
        targetEntity: 'loan',
        targetId: '00000000-0000-0000-0000-000000000030',
        actorId: '00000000-0000-0000-0000-000000000010',
        actionType: 'loan_disbursed',
        startDate: new Date('2024-01-01T00:00:00Z'),
        endDate: new Date('2024-12-31T23:59:59Z'),
      });
    });

    it('should use default pagination when not specified', async () => {
      await service.findAll({});

      expect(repository.findAll).toHaveBeenCalledWith({
        skip: undefined,
        take: undefined,
        targetEntity: undefined,
        targetId: undefined,
        actorId: undefined,
        actionType: undefined,
        startDate: undefined,
        endDate: undefined,
      });
    });
  });

  describe('append-only enforcement', () => {
    it('should not expose any update method', () => {
      const svc = service as unknown as Record<string, unknown>;
      expect(svc['updateAuditLog']).toBeUndefined();
      expect(svc['update']).toBeUndefined();
    });

    it('should not expose any delete method', () => {
      const svc = service as unknown as Record<string, unknown>;
      expect(svc['deleteAuditLog']).toBeUndefined();
      expect(svc['delete']).toBeUndefined();
      expect(svc['remove']).toBeUndefined();
    });
  });
});
