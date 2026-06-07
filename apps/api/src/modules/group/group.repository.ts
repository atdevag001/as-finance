import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Prisma transaction client type.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Group repository — data access for groups, group members, and group collections.
 */
@Injectable()
export class GroupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new group.
   */
  async createGroup(
    data: {
      name: string;
      meeting_day: string;
      branch_area: string;
      leader_id: string;
      created_by: string;
    },
    tx?: TxClient,
  ) {
    const client = tx ?? this.prisma;
    return client.groups.create({
      data: data as never,
    });
  }

  /**
   * Find a group by ID with members and basic info.
   */
  async findById(id: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.groups.findUnique({
      where: { id },
      include: {
        leader: {
          select: { id: true, full_name: true, mobile: true },
        },
        members: {
          where: { is_active: true },
          include: {
            customer: {
              select: { id: true, full_name: true, mobile: true },
            },
          },
          orderBy: { joined_at: 'asc' as const },
        },
      },
    });
  }

  /**
   * List groups with pagination and optional filters.
   */
  async findAll(params: { skip?: number; take?: number; status?: string; branchArea?: string }) {
    const where: Record<string, unknown> = {};
    if (params.status) where['status'] = params.status;
    if (params.branchArea) where['branch_area'] = params.branchArea;

    const [data, total] = await Promise.all([
      this.prisma.groups.findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 20,
        include: {
          leader: { select: { id: true, full_name: true } },
          _count: { select: { members: { where: { is_active: true } } } },
        },
        orderBy: { created_at: 'desc' as const },
      }),
      this.prisma.groups.count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Lock the group row using SELECT ... FOR UPDATE so concurrent membership writes serialize.
   */
  async lockGroupForUpdate(groupId: string, tx: TxClient): Promise<{ id: string } | null> {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM groups WHERE id = ${groupId}::uuid FOR UPDATE`;
    return rows[0] ?? null;
  }

  /**
   * Count active members in a group.
   */
  async countActiveMembers(groupId: string, tx?: TxClient): Promise<number> {
    const client = tx ?? this.prisma;
    return client.group_members.count({
      where: { group_id: groupId, is_active: true },
    });
  }

  /**
   * Check if a customer is already an active member of a group.
   */
  async isActiveMember(groupId: string, customerId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    const member = await client.group_members.findFirst({
      where: { group_id: groupId, customer_id: customerId, is_active: true },
    });
    return !!member;
  }

  /**
   * Add a member to a group.
   */
  async addMember(groupId: string, customerId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.group_members.create({
      data: { group_id: groupId, customer_id: customerId },
    });
  }

  /**
   * Find a group member by ID.
   */
  async findMemberById(memberId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.group_members.findUnique({
      where: { id: memberId },
      include: {
        customer: { select: { id: true, full_name: true } },
      },
    });
  }

  /**
   * Deactivate a group member (soft removal).
   */
  async deactivateMember(memberId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;
    return client.group_members.update({
      where: { id: memberId },
      data: { is_active: false, left_at: new Date() },
    });
  }

  /**
   * Check if a customer has active loans linked to a specific group.
   */
  async hasActiveGroupLoans(customerId: string, groupId: string, tx?: TxClient): Promise<boolean> {
    const client = tx ?? this.prisma;
    const count = await client.loans.count({
      where: {
        customer_id: customerId,
        group_id: groupId,
        status: { in: ['active', 'overdue', 'disbursed'] },
      },
    });
    return count > 0;
  }

  /**
   * Verify a customer exists.
   */
  async customerExists(customerId: string): Promise<boolean> {
    const customer = await this.prisma.customers.findUnique({
      where: { id: customerId },
      select: { id: true },
    });
    return !!customer;
  }

  /**
   * Create a group collection record.
   */
  async createGroupCollection(
    data: {
      group_id: string;
      total_amount_paise: bigint | number;
      collection_date: Date;
      collected_by: string;
      idempotency_key: string;
      member_breakdown: unknown;
    },
    tx: TxClient,
  ) {
    return tx.group_collections.create({
      data: data as never,
    });
  }

  /**
   * Get all active loans linked to this group for its active members.
   * Scoped by group_id so unrelated personal/other-group loans cannot be paid through this group.
   */
  async getGroupMemberLoans(groupId: string, tx?: TxClient) {
    const client = tx ?? this.prisma;

    // First get all active member customer IDs
    const members = await client.group_members.findMany({
      where: { group_id: groupId, is_active: true },
      select: { customer_id: true },
    });
    const customerIds = members.map((m) => m.customer_id);

    if (customerIds.length === 0) return [];

    // Restrict to loans actually booked under this group to prevent cross-group collection posting
    return client.loans.findMany({
      where: {
        customer_id: { in: customerIds },
        group_id: groupId,
        status: { in: ['active', 'overdue'] },
      },
      select: {
        id: true,
        loan_number: true,
        customer_id: true,
        group_id: true,
        status: true,
        cached_outstanding_paise: true,
        dpd: true,
        overdue_bucket: true,
        customer: { select: { id: true, full_name: true } },
        schedules: {
          select: {
            id: true,
            installment_number: true,
            due_date: true,
            principal_paise: true,
            interest_paise: true,
            total_paise: true,
            principal_paid_paise: true,
            interest_paid_paise: true,
            penalty_paid_paise: true,
            status: true,
          },
          orderBy: { due_date: 'asc' as const },
        },
      },
    });
  }

  /**
   * Get group summary data: all loans linked to the group with outstanding info.
   */
  async getGroupSummaryData(groupId: string) {
    const group = await this.prisma.groups.findUnique({
      where: { id: groupId },
      include: {
        leader: { select: { id: true, full_name: true } },
        members: {
          where: { is_active: true },
          include: {
            customer: {
              select: {
                id: true,
                full_name: true,
                loans: {
                  where: { group_id: groupId },
                  select: {
                    id: true,
                    loan_number: true,
                    status: true,
                    cached_outstanding_paise: true,
                    dpd: true,
                    overdue_bucket: true,
                    total_payable_paise: true,
                  },
                },
              },
            },
          },
        },
        group_collections: {
          select: {
            id: true,
            total_amount_paise: true,
            collection_date: true,
          },
          orderBy: { collection_date: 'desc' as const },
        },
      },
    });
    return group;
  }
}
