import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { ConflictError } from '../../common/errors';

export interface CreateUserData {
  username: string;
  password_hash: string;
  full_name: string;
  email?: string;
  mobile: string;
  role: string;
}

export interface UpdateUserData {
  full_name?: string;
  // null is a sentinel for "clear the email column"; undefined means no change.
  email?: string | null;
  mobile?: string;
  role?: string;
  is_active?: boolean;
  version?: number;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateUserData) {
    return this.prisma['users'].create({
      data: {
        username: data.username,
        password_hash: data.password_hash,
        full_name: data.full_name,
        email: data.email ?? null,
        mobile: data.mobile,
        role: data.role as never,
      },
      select: {
        id: true,
        username: true,
        full_name: true,
        email: true,
        mobile: true,
        role: true,
        is_active: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma['users'].findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        full_name: true,
        email: true,
        mobile: true,
        role: true,
        is_active: true,
        last_login_at: true,
        version: true,
        created_at: true,
        updated_at: true,
      },
    });
  }

  async findAll(params: { skip?: number; take?: number; role?: string; search?: string }) {
    const where: Record<string, unknown> = {};
    if (params.role) {
      where['role'] = params.role;
    }
    // Honor the documented `search` query param across name/username/mobile.
    if (params.search) {
      where['OR'] = [
        { full_name: { contains: params.search, mode: 'insensitive' } },
        { username: { contains: params.search, mode: 'insensitive' } },
        { mobile: { contains: params.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma['users'].findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 50,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          username: true,
          full_name: true,
          email: true,
          mobile: true,
          role: true,
          is_active: true,
          last_login_at: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma['users'].count({ where }),
    ]);

    return { data, total };
  }

  async findByUsername(username: string) {
    return this.prisma['users'].findUnique({
      where: { username },
      select: { id: true },
    });
  }

  async findByMobile(mobile: string) {
    return this.prisma['users'].findUnique({
      where: { mobile },
      select: { id: true },
    });
  }

  async findByEmail(email: string) {
    return this.prisma['users'].findUnique({
      where: { email },
      select: { id: true },
    });
  }

  async countActiveByRole(role: string) {
    return this.prisma['users'].count({
      where: { role: role as never, is_active: true },
    });
  }

  async update(id: string, data: UpdateUserData, expectedVersion?: number) {
    const updateData: Record<string, unknown> = {};
    if (data.full_name !== undefined) updateData['full_name'] = data.full_name;
    if (data.email !== undefined) updateData['email'] = data.email;
    if (data.mobile !== undefined) updateData['mobile'] = data.mobile;
    if (data.role !== undefined) updateData['role'] = data.role;
    if (data.is_active !== undefined) updateData['is_active'] = data.is_active;

    const selectFields = {
      id: true,
      username: true,
      full_name: true,
      email: true,
      mobile: true,
      role: true,
      is_active: true,
      last_login_at: true,
      version: true,
      created_at: true,
      updated_at: true,
    };

    // When caller supplies expectedVersion, guard the write so concurrent edits
    // cannot silently overwrite each other (last-write-wins).
    if (expectedVersion !== undefined) {
      const result = await this.prisma['users'].updateMany({
        where: { id, version: expectedVersion },
        data: { ...updateData, version: { increment: 1 } } as never,
      });

      if (result.count === 0) {
        throw new ConflictError(
          'User was modified by another request. Please reload and retry.',
          'CONFLICT_OPTIMISTIC_LOCK',
        );
      }

      // updateMany succeeded, so the row exists — use findUniqueOrThrow to
      // narrow the return type and match the non-null update() path.
      return this.prisma['users'].findUniqueOrThrow({
        where: { id },
        select: selectFields,
      });
    }

    return this.prisma['users'].update({
      where: { id },
      data: { ...updateData, version: { increment: 1 } } as never,
      select: selectFields,
    });
  }

  async createAreaAssignment(data: {
    user_id: string;
    area_name: string;
    assigned_by: string;
  }) {
    return this.prisma['user_area_assignments'].create({
      data: {
        user_id: data.user_id,
        area_name: data.area_name,
        assigned_by: data.assigned_by,
      },
      select: {
        id: true,
        user_id: true,
        area_name: true,
        is_active: true,
        assigned_by: true,
        created_at: true,
      },
    });
  }

  async findAreaAssignment(id: string) {
    return this.prisma['user_area_assignments'].findUnique({
      where: { id },
      select: {
        id: true,
        user_id: true,
        area_name: true,
        is_active: true,
        assigned_by: true,
        created_at: true,
      },
    });
  }

  async findActiveAreaAssignments(userId: string) {
    return this.prisma['user_area_assignments'].findMany({
      where: { user_id: userId, is_active: true },
      select: {
        id: true,
        area_name: true,
        is_active: true,
        assigned_by: true,
        created_at: true,
      },
    });
  }

  async deactivateAreaAssignment(id: string) {
    return this.prisma['user_area_assignments'].update({
      where: { id },
      data: { is_active: false },
      select: {
        id: true,
        user_id: true,
        area_name: true,
        is_active: true,
      },
    });
  }
}
