import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GroupRepository } from './group.repository';
import { CollectionService } from '../collection/collection.service';
import { AuditService } from '../audit/audit.service';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { AddGroupMemberDto } from './dto/add-group-member.dto';
import { PostGroupCollectionDto } from './dto/post-group-collection.dto';
import { BusinessRuleError, NotFoundError } from '../../common/errors';

/** Minimum group size. */
const MIN_GROUP_SIZE = 5;
/** Maximum group size. */
const MAX_GROUP_SIZE = 15;

/**
 * Group service — business logic for group lending management.
 *
 * Responsibilities:
 * - Group CRUD with size constraints (5–15 members)
 * - Member management with active loan checks before removal
 * - Group collection posting with member-wise breakdown validation
 * - Group summary with delinquency tracking
 *
 * Requirements: 11.1–11.9
 */
@Injectable()
export class GroupService {
  private readonly logger = new Logger(GroupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly groupRepository: GroupRepository,
    private readonly collectionService: CollectionService,
    private readonly auditService: AuditService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Create a new group.
   *
   * Validates that the leader is an existing customer.
   * The leader is automatically added as the first member.
   *
   * Requirement 11.1
   */
  async createGroup(dto: CreateGroupDto, actorId: string, actorRole: string) {
    // Verify leader is a valid customer
    const leaderExists = await this.groupRepository.customerExists(dto.leaderId);
    if (!leaderExists) {
      throw new NotFoundError(`Customer not found for group leader: ${dto.leaderId}`);
    }

    const group = await this.prisma.$transaction(async (tx) => {
      const created = await this.groupRepository.createGroup(
        {
          name: dto.name,
          meeting_day: dto.meetingDay,
          branch_area: dto.branchArea,
          leader_id: dto.leaderId,
          created_by: actorId,
        },
        tx,
      );

      // Auto-add leader as first member
      await this.groupRepository.addMember(created.id, dto.leaderId, tx);

      await this.auditService.createAuditLog(
        {
          action_type: 'customer_created', // closest audit action for group creation
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'group',
          target_id: created.id,
          after_state: {
            name: dto.name,
            meeting_day: dto.meetingDay,
            branch_area: dto.branchArea,
            leader_id: dto.leaderId,
          },
        },
        tx,
      );

      return created;
    });

    this.logger.log({ msg: 'Group created', groupId: group.id, name: dto.name });
    return group;
  }

  /**
   * Get a group by ID with flattened member and loan data.
   * @throws NotFoundError if group does not exist
   */
  async findById(id: string) {
    const group = await this.groupRepository.findById(id);
    if (!group) {
      throw new NotFoundError(`Group not found: ${id}`);
    }

    // Get active loans linked to this group
    const groupLoans = await this.groupRepository.getGroupMemberLoans(id);
    const loansByCustomer = new Map<string, typeof groupLoans[0]>();
    for (const loan of groupLoans) {
      loansByCustomer.set(loan.customer_id, loan);
    }

    // Get group collections
    const collections = await this.prisma.group_collections.findMany({
      where: { group_id: id },
      select: {
        id: true,
        total_amount_paise: true,
        collection_date: true,
      },
      orderBy: { collection_date: 'desc' },
      take: 20,
    });

    // Transform to frontend-expected structure
    return {
      id: group.id,
      name: group.name,
      meeting_day: group.meeting_day,
      branch_area: group.branch_area,
      status: group.status,
      leader_name: group.leader?.full_name ?? null,
      member_count: group.members.length,
      members: group.members.map((m) => {
        const loan = loansByCustomer.get(m.customer_id);
        return {
          id: m.id,
          customer_id: m.customer_id,
          customer_name: m.customer.full_name,
          loan_id: loan?.id ?? null,
          loan_number: loan?.loan_number ?? null,
          outstanding_paise: loan?.cached_outstanding_paise ? Number(loan.cached_outstanding_paise) : null,
        };
      }),
      collections: collections.map((c) => ({
        id: c.id,
        group_id: id,
        total_amount_paise: Number(c.total_amount_paise),
        payment_date: c.collection_date,
        status: 'completed',
      })),
    };
  }

  /**
   * List groups with pagination.
   */
  async findAll(params: { skip?: number; take?: number; status?: string; branchArea?: string }) {
    const result = await this.groupRepository.findAll(params);

    // Transform to frontend-expected structure
    return {
      data: result.data.map((g) => ({
        id: g.id,
        name: g.name,
        leader_name: g.leader?.full_name ?? null,
        member_count: g._count?.members ?? 0,
        meeting_day: g.meeting_day,
        status: g.status,
        created_at: g.created_at,
      })),
      total: result.total,
    };
  }

  /**
   * Add a member to a group.
   *
   * Enforces maximum group size of 15 active members.
   * Verifies customer exists and is not already an active member.
   *
   * Requirement 11.2
   */
  async addMember(groupId: string, dto: AddGroupMemberDto, actorId: string, actorRole: string) {
    const group = await this.groupRepository.findById(groupId);
    if (!group) {
      throw new NotFoundError(`Group not found: ${groupId}`);
    }

    if (group.status !== 'active') {
      throw new BusinessRuleError(
        `Cannot add members to a group with status '${group.status}'`,
        'GROUP_NOT_ACTIVE',
      );
    }

    // Verify customer exists
    const customerExists = await this.groupRepository.customerExists(dto.customerId);
    if (!customerExists) {
      throw new NotFoundError(`Customer not found: ${dto.customerId}`);
    }

    // Check if already a member
    const alreadyMember = await this.groupRepository.isActiveMember(groupId, dto.customerId);
    if (alreadyMember) {
      throw new BusinessRuleError(
        'Customer is already an active member of this group',
        'DUPLICATE_GROUP_MEMBER',
      );
    }

    // Enforce max size
    const currentCount = await this.groupRepository.countActiveMembers(groupId);
    if (currentCount >= MAX_GROUP_SIZE) {
      throw new BusinessRuleError(
        `Group has reached maximum size of ${MAX_GROUP_SIZE} members`,
        'GROUP_MAX_SIZE_EXCEEDED',
      );
    }

    const member = await this.groupRepository.addMember(groupId, dto.customerId);

    await this.auditService.createAuditLog({
      action_type: 'customer_updated',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'group',
      target_id: groupId,
      after_state: {
        action: 'member_added',
        customer_id: dto.customerId,
        member_count: currentCount + 1,
      },
    });

    this.logger.log({
      msg: 'Member added to group',
      groupId,
      customerId: dto.customerId,
    });

    return member;
  }

  /**
   * Remove a member from a group.
   *
   * Enforces minimum group size of 5 active members.
   * Verifies no active loans before removal.
   *
   * Requirement 11.2, 11.9
   */
  async removeMember(
    groupId: string,
    memberId: string,
    actorId: string,
    actorRole: string,
  ) {
    const group = await this.groupRepository.findById(groupId);
    if (!group) {
      throw new NotFoundError(`Group not found: ${groupId}`);
    }

    const member = await this.groupRepository.findMemberById(memberId);
    if (!member || member.group_id !== groupId) {
      throw new NotFoundError(`Member not found in group: ${memberId}`);
    }

    if (!member.is_active) {
      throw new BusinessRuleError('Member is already inactive', 'MEMBER_ALREADY_INACTIVE');
    }

    // Enforce min size
    const currentCount = await this.groupRepository.countActiveMembers(groupId);
    if (currentCount <= MIN_GROUP_SIZE) {
      throw new BusinessRuleError(
        `Cannot remove member: group would fall below minimum size of ${MIN_GROUP_SIZE} members`,
        'GROUP_MIN_SIZE_VIOLATED',
      );
    }

    // Check for active loans linked to this group
    const hasActiveLoans = await this.groupRepository.hasActiveGroupLoans(
      member.customer_id,
      groupId,
    );
    if (hasActiveLoans) {
      throw new BusinessRuleError(
        'Cannot remove member with active loans linked to this group',
        'MEMBER_HAS_ACTIVE_LOANS',
      );
    }

    await this.groupRepository.deactivateMember(memberId);

    await this.auditService.createAuditLog({
      action_type: 'customer_updated',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'group',
      target_id: groupId,
      before_state: { member_id: memberId, customer_id: member.customer_id, active: true },
      after_state: { member_id: memberId, customer_id: member.customer_id, active: false },
    });

    this.logger.log({
      msg: 'Member removed from group',
      groupId,
      memberId,
      customerId: member.customer_id,
    });

    return { success: true };
  }

  /**
   * Post a group collection.
   *
   * Validates sum(member amounts) == total, then posts individual collections
   * for each member via the collection service within a single transaction.
   * Generates individual receipts per member.
   *
   * Requirements: 11.4, 11.5, 11.7
   */
  async postGroupCollection(
    groupId: string,
    dto: PostGroupCollectionDto,
    actorId: string,
    actorRole: string,
  ) {
    // 1. Idempotency check
    const cached = await this.idempotencyService.find(dto.idempotencyKey);
    if (cached) {
      this.logger.log({
        msg: 'Returning cached group collection result (idempotency hit)',
        idempotencyKey: dto.idempotencyKey,
      });
      return { statusCode: cached.resultStatus, data: cached.resultBody };
    }

    // 2. Validate group exists and is active
    const group = await this.groupRepository.findById(groupId);
    if (!group) {
      throw new NotFoundError(`Group not found: ${groupId}`);
    }
    if (group.status !== 'active') {
      throw new BusinessRuleError(
        `Cannot post collection for group with status '${group.status}'`,
        'GROUP_NOT_ACTIVE',
      );
    }

    // 3. Validate sum(member amounts) == total
    const memberSum = dto.memberBreakdown.reduce((sum, m) => sum + m.amountPaise, 0);
    if (memberSum !== dto.totalAmountPaise) {
      throw new BusinessRuleError(
        `Member breakdown sum (${memberSum} paise) does not equal total amount (${dto.totalAmountPaise} paise). Discrepancy: ${dto.totalAmountPaise - memberSum} paise.`,
        'GROUP_COLLECTION_SUM_MISMATCH',
      );
    }

    // 4. Verify all loans in breakdown belong to this group
    const groupLoans = await this.groupRepository.getGroupMemberLoans(groupId);
    const groupLoanIds = new Set(groupLoans.map((l) => l.id));
    for (const item of dto.memberBreakdown) {
      if (!groupLoanIds.has(item.loanId)) {
        throw new BusinessRuleError(
          `Loan ${item.loanId} is not an active loan in this group`,
          'LOAN_NOT_IN_GROUP',
        );
      }
    }

    // 5. Execute within a single transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create group collection record
      const groupCollection = await this.groupRepository.createGroupCollection(
        {
          group_id: groupId,
          total_amount_paise: dto.totalAmountPaise,
          collection_date: new Date(dto.collectionDate),
          collected_by: actorId,
          idempotency_key: dto.idempotencyKey,
          member_breakdown: dto.memberBreakdown,
        },
        tx,
      );

      // Post individual collections for each member
      const individualResults: Array<{
        loanId: string;
        amountPaise: number;
        collectionResult: unknown;
      }> = [];

      for (const item of dto.memberBreakdown) {
        // Generate a deterministic idempotency key for each member collection
        const memberIdempotencyKey = `${dto.idempotencyKey}__member__${item.loanId}`;

        const collectionResult = await this.collectionService.postCollection(
          {
            loanId: item.loanId,
            amountPaise: item.amountPaise,
            paymentDate: dto.collectionDate,
            paymentMode: dto.paymentMode,
            idempotencyKey: memberIdempotencyKey,
          },
          actorId,
          actorRole,
        );

        individualResults.push({
          loanId: item.loanId,
          amountPaise: item.amountPaise,
          collectionResult: collectionResult.data,
        });
      }

      // Audit log
      await this.auditService.createAuditLog(
        {
          action_type: 'collection_posted',
          actor_id: actorId,
          actor_role: actorRole,
          target_entity: 'group_collection',
          target_id: groupCollection.id,
          after_state: {
            group_id: groupId,
            total_amount_paise: dto.totalAmountPaise,
            member_count: dto.memberBreakdown.length,
          },
        },
        tx,
      );

      // Store idempotency result
      const resultBody = {
        groupCollectionId: groupCollection.id,
        groupId,
        totalAmountPaise: dto.totalAmountPaise,
        collectionDate: dto.collectionDate,
        memberResults: individualResults,
      };

      await this.idempotencyService.store(
        dto.idempotencyKey,
        'group_collection',
        201,
        resultBody,
        tx,
      );

      return resultBody;
    });

    this.logger.log({
      msg: 'Group collection posted successfully',
      groupId,
      totalAmountPaise: dto.totalAmountPaise,
      memberCount: dto.memberBreakdown.length,
    });

    return { statusCode: 201, data: result };
  }

  /**
   * Get group summary: total outstanding, total collected, member-wise payment
   * status, and group delinquency status.
   *
   * A group is delinquent when any member has overdue installments.
   *
   * Requirements: 11.6, 11.8
   */
  async getGroupSummary(groupId: string) {
    const group = await this.groupRepository.getGroupSummaryData(groupId);
    if (!group) {
      throw new NotFoundError(`Group not found: ${groupId}`);
    }

    let totalOutstandingPaise = 0;
    let totalCollectedPaise = 0;
    let isGroupDelinquent = false;

    // Calculate total collected from group collections
    for (const gc of group.group_collections) {
      totalCollectedPaise += Number(gc.total_amount_paise);
    }

    // Build member-wise status
    const memberStatuses = group.members.map((member) => {
      const loans = member.customer.loans;
      let memberOutstanding = 0;
      let memberDelinquent = false;
      let maxDpd = 0;

      for (const loan of loans) {
        memberOutstanding += Number(loan.cached_outstanding_paise ?? 0);
        if (loan.status === 'overdue' || (loan.dpd && loan.dpd > 0)) {
          memberDelinquent = true;
          if (loan.dpd > maxDpd) maxDpd = loan.dpd;
        }
      }

      totalOutstandingPaise += memberOutstanding;
      if (memberDelinquent) isGroupDelinquent = true;

      return {
        memberId: member.id,
        customerId: member.customer.id,
        customerName: member.customer.full_name,
        loans: loans.map((l) => ({
          loanId: l.id,
          loanNumber: l.loan_number,
          status: l.status,
          outstandingPaise: Number(l.cached_outstanding_paise ?? 0),
          dpd: l.dpd,
          overdueBucket: l.overdue_bucket,
        })),
        outstandingPaise: memberOutstanding,
        isDelinquent: memberDelinquent,
        maxDpd,
      };
    });

    return {
      groupId: group.id,
      groupName: group.name,
      status: group.status,
      meetingDay: group.meeting_day,
      branchArea: group.branch_area,
      leader: group.leader,
      totalOutstandingPaise,
      totalCollectedPaise,
      isGroupDelinquent,
      memberCount: group.members.length,
      members: memberStatuses,
    };
  }
}
