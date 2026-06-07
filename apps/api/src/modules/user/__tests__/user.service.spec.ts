import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@as-finance/shared';
import { UserService } from '../user.service';
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../../common/errors';

vi.mock('bcryptjs', () => ({
  hash: vi.fn(),
}));

const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
const mockActorId = '660e8400-e29b-41d4-a716-446655440001';

const mockUser = {
  id: mockUserId,
  username: 'fieldofficer1',
  full_name: 'Field Officer One',
  email: null,
  mobile: '9876543210',
  role: 'field_officer',
  is_active: true,
  last_login_at: null,
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
};

function createMockRepository() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    findByUsername: vi.fn(),
    findByMobile: vi.fn(),
    findByEmail: vi.fn(),
    countActiveByRole: vi.fn().mockResolvedValue(2),
    update: vi.fn(),
    createAreaAssignment: vi.fn(),
    findAreaAssignment: vi.fn(),
    findActiveAreaAssignments: vi.fn(),
    deactivateAreaAssignment: vi.fn(),
  };
}

function createMockAuditService() {
  return {
    createAuditLog: vi.fn().mockResolvedValue({ id: 'audit-1' }),
  };
}

describe('UserService', () => {
  let service: UserService;
  let mockRepo: ReturnType<typeof createMockRepository>;
  let mockAudit: ReturnType<typeof createMockAuditService>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    mockAudit = createMockAuditService();
    service = new UserService(mockRepo as never, mockAudit as never);
  });

  describe('createUser', () => {
    const createDto = {
      username: 'newuser',
      password: 'ValidPass1',
      fullName: 'New User',
      mobile: '9876543211',
      role: UserRole.FIELD_OFFICER,
    };

    it('should create a user when super_admin assigns any role', async () => {
      mockRepo.findByUsername.mockResolvedValue(null);
      mockRepo.findByMobile.mockResolvedValue(null);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');
      mockRepo.create.mockResolvedValue({ id: 'new-id', ...createDto });

      const result = await service.createUser(
        createDto,
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(result).toBeDefined();
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'newuser',
          password_hash: 'hashed-pw',
          full_name: 'New User',
          mobile: '9876543211',
          role: UserRole.FIELD_OFFICER,
        }),
      );
    });

    it('should allow super_admin to create another super_admin', async () => {
      const dto = { ...createDto, role: UserRole.SUPER_ADMIN };
      mockRepo.findByUsername.mockResolvedValue(null);
      mockRepo.findByMobile.mockResolvedValue(null);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');
      mockRepo.create.mockResolvedValue({ id: 'new-id', ...dto });

      await expect(
        service.createUser(dto, mockActorId, UserRole.SUPER_ADMIN),
      ).resolves.toBeDefined();
    });

    it('should allow manager to create field_officer', async () => {
      mockRepo.findByUsername.mockResolvedValue(null);
      mockRepo.findByMobile.mockResolvedValue(null);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');
      mockRepo.create.mockResolvedValue({ id: 'new-id', ...createDto });

      await expect(
        service.createUser(createDto, mockActorId, UserRole.MANAGER),
      ).resolves.toBeDefined();
    });

    it('should prevent manager from creating super_admin', async () => {
      const dto = { ...createDto, role: UserRole.SUPER_ADMIN };

      await expect(
        service.createUser(dto, mockActorId, UserRole.MANAGER),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should prevent manager from creating another manager', async () => {
      const dto = { ...createDto, role: UserRole.MANAGER };

      await expect(
        service.createUser(dto, mockActorId, UserRole.MANAGER),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw ConflictError for duplicate username', async () => {
      mockRepo.findByUsername.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createUser(createDto, mockActorId, UserRole.SUPER_ADMIN),
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError for duplicate mobile', async () => {
      mockRepo.findByUsername.mockResolvedValue(null);
      mockRepo.findByMobile.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createUser(createDto, mockActorId, UserRole.SUPER_ADMIN),
      ).rejects.toThrow(ConflictError);
    });

    it('should throw ConflictError for duplicate email', async () => {
      const dto = { ...createDto, email: 'test@example.com' };
      mockRepo.findByUsername.mockResolvedValue(null);
      mockRepo.findByMobile.mockResolvedValue(null);
      mockRepo.findByEmail.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createUser(dto, mockActorId, UserRole.SUPER_ADMIN),
      ).rejects.toThrow(ConflictError);
    });

    it('should hash password with configured bcrypt cost', async () => {
      mockRepo.findByUsername.mockResolvedValue(null);
      mockRepo.findByMobile.mockResolvedValue(null);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');
      mockRepo.create.mockResolvedValue({ id: 'new-id' });

      await service.createUser(createDto, mockActorId, UserRole.SUPER_ADMIN);

      // Cost is configurable via BCRYPT_COST env (default 12, test env may use lower)
      expect(bcrypt.hash).toHaveBeenCalledWith('ValidPass1', expect.any(Number));
    });
  });

  describe('findById', () => {
    it('should return user when found', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);

      const result = await service.findById(mockUserId);
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundError when user not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const mockResult = { data: [mockUser], total: 1 };
      mockRepo.findAll.mockResolvedValue(mockResult);

      const result = await service.findAll({ skip: 0, take: 10 });
      expect(result).toEqual(mockResult);
      expect(mockRepo.findAll).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
      });
    });

    it('should pass role filter to repository', async () => {
      const mockResult = { data: [mockUser], total: 1 };
      mockRepo.findAll.mockResolvedValue(mockResult);

      const result = await service.findAll({
        skip: 0,
        take: 20,
        role: UserRole.FIELD_OFFICER,
      });

      expect(result).toEqual(mockResult);
      expect(mockRepo.findAll).toHaveBeenCalledWith({
        skip: 0,
        take: 20,
        role: UserRole.FIELD_OFFICER,
      });
    });

    it('should return empty list when no users match', async () => {
      const mockResult = { data: [], total: 0 };
      mockRepo.findAll.mockResolvedValue(mockResult);

      const result = await service.findAll({ role: UserRole.SUPER_ADMIN });
      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('updateUser', () => {
    it('should update user fields', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, full_name: 'Updated Name' });

      const result = await service.updateUser(
        mockUserId,
        { fullName: 'Updated Name' },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(result.full_name).toBe('Updated Name');
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateUser(
          'nonexistent',
          { fullName: 'Test' },
          mockActorId,
          UserRole.SUPER_ADMIN,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('should prevent self role change', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        id: mockActorId,
        role: 'manager',
      });

      await expect(
        service.updateUser(
          mockActorId,
          { role: UserRole.SUPER_ADMIN },
          mockActorId,
          UserRole.MANAGER,
        ),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should allow super_admin to change role to manager', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, role: 'manager' });

      const result = await service.updateUser(
        mockUserId,
        { role: UserRole.MANAGER },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(result.role).toBe('manager');
    });

    it('should prevent manager from escalating to super_admin', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(
          mockUserId,
          { role: UserRole.SUPER_ADMIN },
          mockActorId,
          UserRole.MANAGER,
        ),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should check mobile uniqueness on update', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findByMobile.mockResolvedValue({ id: 'other-user-id' });

      await expect(
        service.updateUser(
          mockUserId,
          { mobile: '9999999999' },
          mockActorId,
          UserRole.SUPER_ADMIN,
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('should allow same mobile if it belongs to the same user', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findByMobile.mockResolvedValue({ id: mockUserId });
      mockRepo.update.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(
          mockUserId,
          { mobile: '9876543210' },
          mockActorId,
          UserRole.SUPER_ADMIN,
        ),
      ).resolves.toBeDefined();
    });

    it('should check email uniqueness on update', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, email: 'old@example.com' });
      mockRepo.findByEmail.mockResolvedValue({ id: 'other-user-id' });

      await expect(
        service.updateUser(
          mockUserId,
          { email: 'taken@example.com' },
          mockActorId,
          UserRole.SUPER_ADMIN,
        ),
      ).rejects.toThrow(ConflictError);
    });

    it('should allow same email if it belongs to the same user', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, email: 'me@example.com' });
      mockRepo.findByEmail.mockResolvedValue({ id: mockUserId });
      mockRepo.update.mockResolvedValue({ ...mockUser, email: 'me@example.com' });

      await expect(
        service.updateUser(
          mockUserId,
          { email: 'me@example.com' },
          mockActorId,
          UserRole.SUPER_ADMIN,
        ),
      ).resolves.toBeDefined();
    });

    it('should pass isActive=false for deactivation', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, is_active: false });

      const result = await service.updateUser(
        mockUserId,
        { isActive: false },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(result.is_active).toBe(false);
      // Third arg is the optimistic-lock expectedVersion (undefined when the
      // caller doesn't supply one), so we assert the call shape exactly.
      expect(mockRepo.update).toHaveBeenCalledWith(
        mockUserId,
        expect.objectContaining({ is_active: false }),
        undefined,
      );
    });

    it('should allow manager to change role to collection_officer', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, role: 'collection_officer' });

      const result = await service.updateUser(
        mockUserId,
        { role: UserRole.COLLECTION_OFFICER },
        mockActorId,
        UserRole.MANAGER,
      );

      expect(result.role).toBe('collection_officer');
    });

    it('should prevent non-admin/non-manager from assigning roles', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(
          mockUserId,
          { role: UserRole.ACCOUNTANT },
          mockActorId,
          UserRole.FIELD_OFFICER,
        ),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should not trigger role validation when role is unchanged', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, full_name: 'New Name' });

      // Same role as current — should not trigger validateRoleAssignment
      const result = await service.updateUser(
        mockUserId,
        { role: UserRole.FIELD_OFFICER, fullName: 'New Name' },
        mockActorId,
        UserRole.FIELD_OFFICER,
      );

      expect(result.full_name).toBe('New Name');
    });
  });

  describe('addAreaAssignment', () => {
    it('should assign area to field officer', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findActiveAreaAssignments.mockResolvedValue([]);
      mockRepo.createAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: mockUserId,
        area_name: 'Zone A',
        is_active: true,
        assigned_by: mockActorId,
        created_at: new Date(),
      });

      const result = await service.addAreaAssignment(
        mockUserId,
        'Zone A',
        mockActorId,
      );

      expect(result.area_name).toBe('Zone A');
    });

    it('should assign area to collection officer', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        role: 'collection_officer',
      });
      mockRepo.findActiveAreaAssignments.mockResolvedValue([]);
      mockRepo.createAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: mockUserId,
        area_name: 'Route B',
        is_active: true,
        assigned_by: mockActorId,
        created_at: new Date(),
      });

      const result = await service.addAreaAssignment(
        mockUserId,
        'Route B',
        mockActorId,
      );

      expect(result.area_name).toBe('Route B');
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.addAreaAssignment('nonexistent', 'Zone A', mockActorId),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for non-field/collection role', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        role: 'accountant',
      });

      await expect(
        service.addAreaAssignment(mockUserId, 'Zone A', mockActorId),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw ConflictError for duplicate area assignment', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findActiveAreaAssignments.mockResolvedValue([
        { id: 'area-1', area_name: 'Zone A', is_active: true },
      ]);

      await expect(
        service.addAreaAssignment(mockUserId, 'Zone A', mockActorId),
      ).rejects.toThrow(ConflictError);
    });

    it('should be case-insensitive for duplicate area check', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findActiveAreaAssignments.mockResolvedValue([
        { id: 'area-1', area_name: 'Zone A', is_active: true },
      ]);

      await expect(
        service.addAreaAssignment(mockUserId, 'zone a', mockActorId),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('removeAreaAssignment', () => {
    it('should deactivate area assignment', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: mockUserId,
        area_name: 'Zone A',
        is_active: true,
      });
      mockRepo.deactivateAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: mockUserId,
        area_name: 'Zone A',
        is_active: false,
      });

      const result = await service.removeAreaAssignment(mockUserId, 'area-1');
      expect(result.is_active).toBe(false);
    });

    it('should throw NotFoundError for non-existent user', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.removeAreaAssignment('nonexistent', 'area-1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw NotFoundError if assignment belongs to different user', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: 'different-user-id',
        area_name: 'Zone A',
        is_active: true,
      });

      await expect(
        service.removeAreaAssignment(mockUserId, 'area-1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError if assignment already inactive', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: mockUserId,
        area_name: 'Zone A',
        is_active: false,
      });

      await expect(
        service.removeAreaAssignment(mockUserId, 'area-1'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw NotFoundError if assignment does not exist', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findAreaAssignment.mockResolvedValue(null);

      await expect(
        service.removeAreaAssignment(mockUserId, 'nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('deactivation', () => {
    it('should deactivate a user via updateUser', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, is_active: false });

      const result = await service.updateUser(
        mockUserId,
        { isActive: false },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(result.is_active).toBe(false);
    });

    it('should reactivate a deactivated user', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, is_active: false });
      mockRepo.update.mockResolvedValue({ ...mockUser, is_active: true });

      const result = await service.updateUser(
        mockUserId,
        { isActive: true },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(result.is_active).toBe(true);
    });

    it('should prevent self-deactivation', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockUser, id: mockActorId });

      await expect(
        service.updateUser(
          mockActorId,
          { isActive: false },
          mockActorId,
          UserRole.SUPER_ADMIN,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should prevent deactivating the last active super_admin', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        role: UserRole.SUPER_ADMIN,
      });
      mockRepo.countActiveByRole.mockResolvedValue(1);

      await expect(
        service.updateUser(
          mockUserId,
          { isActive: false },
          mockActorId,
          UserRole.SUPER_ADMIN,
        ),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should allow deactivating a super_admin when others are still active', async () => {
      mockRepo.findById.mockResolvedValue({
        ...mockUser,
        role: UserRole.SUPER_ADMIN,
      });
      mockRepo.countActiveByRole.mockResolvedValue(2);
      mockRepo.update.mockResolvedValue({
        ...mockUser,
        role: UserRole.SUPER_ADMIN,
        is_active: false,
      });

      const result = await service.updateUser(
        mockUserId,
        { isActive: false },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(result.is_active).toBe(false);
    });
  });

  describe('optimistic locking', () => {
    it('should forward version to repository.update', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, full_name: 'Updated' });

      await service.updateUser(
        mockUserId,
        { fullName: 'Updated', version: 3 },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(mockRepo.update).toHaveBeenCalledWith(
        mockUserId,
        expect.any(Object),
        3,
      );
    });

    it('should propagate CONFLICT_OPTIMISTIC_LOCK from repository', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockRejectedValue(
        new ConflictError(
          'User was modified by another request. Please reload and retry.',
          'CONFLICT_OPTIMISTIC_LOCK',
        ),
      );

      await expect(
        service.updateUser(
          mockUserId,
          { fullName: 'Updated', version: 1 },
          mockActorId,
          UserRole.SUPER_ADMIN,
        ),
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('role change authorization', () => {
    it('should allow super_admin to assign manager role', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, role: 'manager' });

      const result = await service.updateUser(
        mockUserId,
        { role: UserRole.MANAGER },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(result.role).toBe('manager');
    });

    it('should allow manager to assign accountant role', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, role: 'accountant' });

      const result = await service.updateUser(
        mockUserId,
        { role: UserRole.ACCOUNTANT },
        mockActorId,
        UserRole.MANAGER,
      );

      expect(result.role).toBe('accountant');
    });

    it('should allow manager to assign viewer_auditor role', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, role: 'viewer_auditor' });

      const result = await service.updateUser(
        mockUserId,
        { role: UserRole.VIEWER_AUDITOR },
        mockActorId,
        UserRole.MANAGER,
      );

      expect(result.role).toBe('viewer_auditor');
    });

    it('should prevent manager from assigning manager role', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(
          mockUserId,
          { role: UserRole.MANAGER },
          mockActorId,
          UserRole.MANAGER,
        ),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should prevent accountant from assigning any role', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);

      await expect(
        service.updateUser(
          mockUserId,
          { role: UserRole.OFFICE_STAFF },
          mockActorId,
          UserRole.ACCOUNTANT,
        ),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('audit logging', () => {
    it('should emit USER_CREATED audit log on createUser', async () => {
      mockRepo.findByUsername.mockResolvedValue(null);
      mockRepo.findByMobile.mockResolvedValue(null);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-pw');
      mockRepo.create.mockResolvedValue({ ...mockUser, id: 'new-id' });

      await service.createUser(
        {
          username: 'newuser',
          password: 'ValidPass1',
          fullName: 'New User',
          mobile: '9876543211',
          role: UserRole.FIELD_OFFICER,
        },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(mockAudit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'user_created',
          actor_id: mockActorId,
          target_entity: 'user',
          target_id: 'new-id',
        }),
      );
    });

    it('should emit USER_ROLE_CHANGED audit log on updateUser', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.update.mockResolvedValue({ ...mockUser, role: 'manager' });

      await service.updateUser(
        mockUserId,
        { role: UserRole.MANAGER },
        mockActorId,
        UserRole.SUPER_ADMIN,
      );

      expect(mockAudit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'user_role_changed',
          target_entity: 'user',
          target_id: mockUserId,
          remarks: 'role_changed',
        }),
      );
    });

    it('should emit audit log on addAreaAssignment', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findActiveAreaAssignments.mockResolvedValue([]);
      mockRepo.createAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: mockUserId,
        area_name: 'Zone A',
        is_active: true,
        assigned_by: mockActorId,
        created_at: new Date(),
      });

      await service.addAreaAssignment(
        mockUserId,
        'Zone A',
        mockActorId,
        UserRole.MANAGER,
      );

      expect(mockAudit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          target_entity: 'user',
          target_id: mockUserId,
          remarks: 'area_assignment_added',
        }),
      );
    });

    it('should emit audit log on removeAreaAssignment', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);
      mockRepo.findAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: mockUserId,
        area_name: 'Zone A',
        is_active: true,
        assigned_by: mockActorId,
      });
      mockRepo.deactivateAreaAssignment.mockResolvedValue({
        id: 'area-1',
        user_id: mockUserId,
        area_name: 'Zone A',
        is_active: false,
      });

      await service.removeAreaAssignment(
        mockUserId,
        'area-1',
        mockActorId,
        UserRole.MANAGER,
      );

      expect(mockAudit.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          target_entity: 'user',
          target_id: mockUserId,
          remarks: 'area_assignment_removed',
        }),
      );
    });
  });
});
