import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const CUSTOMER_SELECT = {
  id: true,
  full_name: true,
  father_or_husband_name: true,
  mobile: true,
  alternate_mobile: true,
  aadhaar_last_four: true,
  pan_last_four: true,
  dob: true,
  age: true,
  gender: true,
  occupation: true,
  monthly_income_paise: true,
  work_or_business_details: true,
  address_line1: true,
  address_line2: true,
  city: true,
  district: true,
  state: true,
  pincode: true,
  risk_level: true,
  status: true,
  blacklist_reason: true,
  blacklisted_at: true,
  assigned_officer_id: true,
  photo_file_id: true,
  notes: true,
  version: true,
  created_by: true,
  created_at: true,
  updated_at: true,
};

export interface CreateCustomerData {
  full_name: string;
  father_or_husband_name?: string;
  mobile: string;
  alternate_mobile?: string;
  aadhaar_number_encrypted: string;
  aadhaar_last_four: string;
  pan_number_encrypted?: string;
  pan_last_four?: string;
  dob?: Date;
  age?: number;
  gender: string;
  occupation?: string;
  monthly_income_paise?: number;
  work_or_business_details?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  photo_file_id?: string;
  assigned_officer_id?: string;
  notes?: string;
  created_by: string;
}

export interface UpdateCustomerData {
  full_name?: string;
  father_or_husband_name?: string;
  mobile?: string;
  alternate_mobile?: string;
  pan_number_encrypted?: string;
  pan_last_four?: string;
  dob?: Date;
  age?: number;
  occupation?: string;
  monthly_income_paise?: number;
  work_or_business_details?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  risk_level?: string;
  photo_file_id?: string;
  assigned_officer_id?: string;
  notes?: string;
}

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCustomerData) {
    return this.prisma['customers'].create({
      data: data as never,
      select: CUSTOMER_SELECT,
    });
  }

  async findById(id: string) {
    return this.prisma['customers'].findUnique({
      where: { id },
      select: {
        ...CUSTOMER_SELECT,
        family_members: {
          select: {
            id: true,
            name: true,
            relationship: true,
            contact_number: true,
            occupation: true,
            income_contribution: true,
            created_at: true,
          },
        },
        guarantors: {
          select: {
            id: true,
            name: true,
            relationship: true,
            mobile: true,
            aadhaar_last_four: true,
            address: true,
            photo_file_id: true,
            created_at: true,
          },
        },
      },
    });
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    status?: string;
    search?: string;
    riskLevel?: string;
    assignedOfficerId?: string;
  }) {
    const where: Record<string, unknown> = {};

    if (params.status) {
      where['status'] = params.status;
    }
    if (params.riskLevel) {
      where['risk_level'] = params.riskLevel;
    }
    if (params.assignedOfficerId) {
      where['assigned_officer_id'] = params.assignedOfficerId;
    }
    if (params.search) {
      where['OR'] = [
        { full_name: { contains: params.search, mode: 'insensitive' } },
        { mobile: { contains: params.search } },
        { aadhaar_last_four: { contains: params.search } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma['customers'].findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 50,
        orderBy: { created_at: 'desc' },
        select: CUSTOMER_SELECT,
      }),
      this.prisma['customers'].count({ where }),
    ]);

    return { data, total };
  }

  async findByAadhaarLastFour(lastFour: string) {
    return this.prisma['customers'].findMany({
      where: { aadhaar_last_four: lastFour },
      select: { id: true, full_name: true, mobile: true, aadhaar_last_four: true, status: true },
    });
  }

  async findByMobile(mobile: string) {
    return this.prisma['customers'].findMany({
      where: { mobile },
      select: { id: true, full_name: true, mobile: true, aadhaar_last_four: true, status: true },
    });
  }

  async update(id: string, data: UpdateCustomerData) {
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        updateData[key] = value;
      }
    }

    return this.prisma['customers'].update({
      where: { id },
      data: updateData,
      select: CUSTOMER_SELECT,
    });
  }

  async blacklist(id: string, reason: string, actorId: string) {
    return this.prisma['customers'].update({
      where: { id },
      data: {
        status: 'blacklisted' as never,
        blacklist_reason: reason,
        blacklisted_at: new Date(),
        blacklisted_by: actorId,
      },
      select: CUSTOMER_SELECT,
    });
  }

  async reinstate(id: string) {
    return this.prisma['customers'].update({
      where: { id },
      data: {
        status: 'active' as never,
        blacklist_reason: null,
        blacklisted_at: null,
        blacklisted_by: null,
      },
      select: CUSTOMER_SELECT,
    });
  }

  async createFamilyMember(data: {
    customer_id: string;
    name: string;
    relationship: string;
    contact_number?: string;
    occupation?: string;
    income_contribution?: string;
  }) {
    return this.prisma['family_members'].create({
      data: data as never,
      select: {
        id: true,
        customer_id: true,
        name: true,
        relationship: true,
        contact_number: true,
        occupation: true,
        income_contribution: true,
        created_at: true,
      },
    });
  }

  async createGuarantor(data: {
    customer_id: string;
    name: string;
    relationship: string;
    mobile: string;
    aadhaar_number_encrypted: string;
    aadhaar_last_four: string;
    address: string;
    photo_file_id?: string;
  }) {
    return this.prisma['guarantors'].create({
      data: data as never,
      select: {
        id: true,
        customer_id: true,
        name: true,
        relationship: true,
        mobile: true,
        aadhaar_last_four: true,
        address: true,
        photo_file_id: true,
        created_at: true,
      },
    });
  }

  async createAuditLog(data: {
    action_type: string;
    actor_id: string;
    actor_role: string;
    target_entity: string;
    target_id: string;
    ip_address?: string;
    request_id?: string;
    before_state?: unknown;
    after_state?: unknown;
    remarks?: string;
  }) {
    return this.prisma['audit_logs'].create({
      data: data as never,
    });
  }
}
