import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditAction, UserRole } from '@as-finance/shared';
import { UserRepository } from './user.repository';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  AuthorizationError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../common/errors';

/** Optional request context for audit log fidelity (ip + requestId). */
export interface UserRequestContext {
  ipAddress?: string;
  requestId?: string;
}

// Use lower bcrypt cost in test/dev for faster hashing (still secure enough for tests)
const BCRYPT_COST = process.env['BCRYPT_COST'] ? parseInt(process.env['BCRYPT_COST'], 10) : 12;

/**
 * Roles that a manager can assign. Managers cannot assign super_admin or manager.
 */
const MANAGER_ASSIGNABLE_ROLES: readonly string[] = [
  UserRole.FIELD_OFFICER,
  UserRole.COLLECTION_OFFICER,
  UserRole.ACCOUNTANT,
  UserRole.OFFICE_STAFF,
  UserRole.VIEWER_AUDITOR,
];

/**
 * Roles eligible for area assignments.
 */
const AREA_ASSIGNABLE_ROLES: readonly string[] = [
  UserRole.FIELD_OFFICER,
  UserRole.COLLECTION_OFFICER,
];

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepository: UserRepository,
    private readonly auditService: AuditService,
  ) {}

  async createUser(
    dto: CreateUserDto,
    actorId: string,
    actorRole: string,
    ctx: UserRequestContext = {},
  ) {
    // Validate role assignment hierarchy
    this.validateRoleAssignment(actorRole, dto.role);

    // Check uniqueness
    const existingUsername = await this.userRepository.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictError('Username already exists', 'USERNAME_EXISTS');
    }

    const existingMobile = await this.userRepository.findByMobile(dto.mobile);
    if (existingMobile) {
      throw new ConflictError('Mobile number already exists', 'MOBILE_EXISTS');
    }

    if (dto.email) {
      const existingEmail = await this.userRepository.findByEmail(dto.email);
      if (existingEmail) {
        throw new ConflictError('Email already exists', 'EMAIL_EXISTS');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    const created = await this.userRepository.create({
      username: dto.username,
      password_hash: passwordHash,
      full_name: dto.fullName,
      email: dto.email,
      mobile: dto.mobile,
      role: dto.role,
    });

    // Compliance: emit audit trail for every user mutation (Requirement 17).
    await this.auditService.createAuditLog({
      action_type: AuditAction.USER_CREATED,
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'user',
      target_id: created.id,
      ip_address: ctx.ipAddress,
      request_id: ctx.requestId,
      after_state: {
        username: created.username,
        full_name: created.full_name,
        email: created.email,
        mobile: created.mobile,
        role: created.role,
        is_active: created.is_active,
      },
    });

    return created;
  }

  async findAll(params: { skip?: number; take?: number; role?: string }) {
    return this.userRepository.findAll(params);
  }

  async findById(id: string) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }
    return user;
  }

  async updateUser(
    id: string,
    dto: UpdateUserDto,
    actorId: string,
    actorRole: string,
    ctx: UserRequestContext = {},
  ) {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    // Rank check: prevent privilege escalation across hierarchy.
    // Managers cannot edit super_admin records at all (privilege escalation
    // surface from audit). Only super_admin can edit super_admin.
    if (
      user.role === UserRole.SUPER_ADMIN &&
      actorRole !== UserRole.SUPER_ADMIN
    ) {
      throw new AuthorizationError(
        'Only super_admin can modify super_admin accounts',
        'INSUFFICIENT_PRIVILEGE',
      );
    }

    // If role change is requested, validate hierarchy
    const roleChanged = !!(dto.role && dto.role !== user.role);
    if (roleChanged) {
      // Prevent self-escalation
      if (id === actorId) {
        throw new AuthorizationError(
          'Cannot change your own role',
          'SELF_ROLE_CHANGE',
        );
      }
      this.validateRoleAssignment(actorRole, dto.role!);
    }

    // Check uniqueness for mobile/email if changed
    if (dto.mobile && dto.mobile !== user.mobile) {
      const existing = await this.userRepository.findByMobile(dto.mobile);
      if (existing && existing.id !== id) {
        throw new ConflictError('Mobile number already exists', 'MOBILE_EXISTS');
      }
    }

    if (dto.email && dto.email !== user.email) {
      const existing = await this.userRepository.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictError('Email already exists', 'EMAIL_EXISTS');
      }
    }

    const updated = await this.userRepository.update(id, {
      full_name: dto.fullName,
      email: dto.email,
      mobile: dto.mobile,
      role: dto.role,
      is_active: dto.isActive,
    });

    // Compliance: emit audit trail for every user mutation. AuditAction enum
    // lacks USER_UPDATED, so all updates flow through USER_ROLE_CHANGED — the
    // before/after_state diff lets reviewers see exactly what changed.
    await this.auditService.createAuditLog({
      action_type: AuditAction.USER_ROLE_CHANGED,
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'user',
      target_id: id,
      ip_address: ctx.ipAddress,
      request_id: ctx.requestId,
      before_state: {
        full_name: user.full_name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        is_active: user.is_active,
      },
      after_state: {
        full_name: updated.full_name,
        email: updated.email,
        mobile: updated.mobile,
        role: updated.role,
        is_active: updated.is_active,
      },
      remarks: roleChanged ? 'role_changed' : 'user_updated',
    });

    return updated;
  }

  async addAreaAssignment(
    userId: string,
    areaName: string,
    actorId: string,
    actorRole: string = UserRole.MANAGER,
    ctx: UserRequestContext = {},
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    if (!AREA_ASSIGNABLE_ROLES.includes(user.role)) {
      throw new BusinessRuleError(
        `Area assignments are only for field officers and collection officers`,
        'INVALID_AREA_ASSIGNMENT_ROLE',
      );
    }

    // Check for duplicate active assignment
    const existing = await this.userRepository.findActiveAreaAssignments(userId);
    const duplicate = existing.find(
      (a: { area_name: string }) => a.area_name.toLowerCase() === areaName.toLowerCase(),
    );
    if (duplicate) {
      throw new ConflictError(
        'Area already assigned to this user',
        'AREA_ALREADY_ASSIGNED',
      );
    }

    const assignment = await this.userRepository.createAreaAssignment({
      user_id: userId,
      area_name: areaName,
      assigned_by: actorId,
    });

    // Area assignment affects what data the user can access — must be audited.
    await this.auditService.createAuditLog({
      action_type: AuditAction.USER_ROLE_CHANGED,
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'user',
      target_id: userId,
      ip_address: ctx.ipAddress,
      request_id: ctx.requestId,
      after_state: {
        area_assignment_id: assignment.id,
        area_name: assignment.area_name,
        is_active: assignment.is_active,
      },
      remarks: 'area_assignment_added',
    });

    return assignment;
  }

  async removeAreaAssignment(
    userId: string,
    areaId: string,
    actorId?: string,
    actorRole: string = UserRole.MANAGER,
    ctx: UserRequestContext = {},
  ) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    }

    const assignment = await this.userRepository.findAreaAssignment(areaId);
    if (assignment?.user_id !== userId) {
      throw new NotFoundError(
        'Area assignment not found',
        'AREA_ASSIGNMENT_NOT_FOUND',
      );
    }

    if (!assignment.is_active) {
      throw new BusinessRuleError(
        'Area assignment is already inactive',
        'AREA_ALREADY_INACTIVE',
      );
    }

    const result = await this.userRepository.deactivateAreaAssignment(areaId);

    // Area de-assignment also changes data access scope — audit it.
    await this.auditService.createAuditLog({
      action_type: AuditAction.USER_ROLE_CHANGED,
      actor_id: actorId ?? assignment.assigned_by,
      actor_role: actorRole,
      target_entity: 'user',
      target_id: userId,
      ip_address: ctx.ipAddress,
      request_id: ctx.requestId,
      before_state: {
        area_assignment_id: areaId,
        area_name: assignment.area_name,
        is_active: true,
      },
      after_state: {
        area_assignment_id: areaId,
        area_name: assignment.area_name,
        is_active: false,
      },
      remarks: 'area_assignment_removed',
    });

    return result;
  }

  /**
   * Validates that the actor's role is allowed to assign the target role.
   * - super_admin can assign any role
   * - manager can assign: field_officer, collection_officer, accountant, office_staff, viewer_auditor
   */
  private validateRoleAssignment(actorRole: string, targetRole: string): void {
    if (actorRole === UserRole.SUPER_ADMIN) {
      // super_admin can assign any role
      return;
    }

    if (actorRole === UserRole.MANAGER) {
      if (!MANAGER_ASSIGNABLE_ROLES.includes(targetRole)) {
        throw new AuthorizationError(
          `Managers cannot assign the role '${targetRole}'`,
          'ROLE_ESCALATION_DENIED',
        );
      }
      return;
    }

    // No other roles should reach here due to RBAC guard, but defend in depth
    throw new AuthorizationError(
      'Insufficient permissions to assign roles',
      'ROLE_ASSIGNMENT_DENIED',
    );
  }
}
