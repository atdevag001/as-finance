import { Injectable, Logger } from '@nestjs/common';
import { UserRole } from '@as-finance/shared';
import { CustomerRepository, UpdateCustomerData } from './customer.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateFamilyMemberDto } from './dto/create-family-member.dto';
import { CreateGuarantorDto } from './dto/create-guarantor.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';

/**
 * Placeholder encryption: prefixes with 'enc_'.
 * In production, replace with a real encryption service.
 */
function encryptField(value: string): string {
  return `enc_${value}`;
}

/** Extract last 4 characters from a string. */
function lastFour(value: string): string {
  return value.slice(-4);
}

/** Roles that can see all customers (not scope-restricted). */
const UNRESTRICTED_ROLES: readonly string[] = [
  UserRole.SUPER_ADMIN,
  UserRole.MANAGER,
  UserRole.ACCOUNTANT,
  UserRole.OFFICE_STAFF,
  UserRole.VIEWER_AUDITOR,
  UserRole.COLLECTION_OFFICER,
];

@Injectable()
export class CustomerService {
  private readonly logger = new Logger(CustomerService.name);

  constructor(private readonly customerRepository: CustomerRepository) {}

  async create(dto: CreateCustomerDto, actorId: string, actorRole: string) {
    // Validate Aadhaar format (already validated by DTO, but defense in depth)
    if (!/^\d{12}$/.test(dto.aadhaarNumber)) {
      throw new ValidationError('Aadhaar must be exactly 12 digits', 'INVALID_AADHAAR');
    }

    // Validate PAN format if provided
    if (dto.panNumber && !/^[A-Z]{5}\d{4}[A-Z]$/.test(dto.panNumber)) {
      throw new ValidationError('Invalid PAN format', 'INVALID_PAN');
    }

    // Check for duplicates
    const duplicateWarnings: Array<{ field: string; matchedCustomers: Array<{ id: string; fullName: string }> }> = [];

    const aadhaarLastFour = lastFour(dto.aadhaarNumber);
    const aadhaarMatches = await this.customerRepository.findByAadhaarLastFour(aadhaarLastFour);
    if (aadhaarMatches.length > 0) {
      duplicateWarnings.push({
        field: 'aadhaar',
        matchedCustomers: aadhaarMatches.map((c: { id: string; full_name: string }) => ({ id: c.id, fullName: c.full_name })),
      });
    }

    const mobileMatches = await this.customerRepository.findByMobile(dto.mobile);
    if (mobileMatches.length > 0) {
      duplicateWarnings.push({
        field: 'mobile',
        matchedCustomers: mobileMatches.map((c: { id: string; full_name: string }) => ({ id: c.id, fullName: c.full_name })),
      });
    }

    // Encrypt sensitive fields
    const aadhaarEncrypted = encryptField(dto.aadhaarNumber);
    const panEncrypted = dto.panNumber ? encryptField(dto.panNumber) : undefined;
    const panLastFour = dto.panNumber ? lastFour(dto.panNumber) : undefined;

    const customer = await this.customerRepository.create({
      full_name: dto.fullName,
      father_or_husband_name: dto.fatherOrHusbandName,
      mobile: dto.mobile,
      alternate_mobile: dto.alternateMobile,
      aadhaar_number_encrypted: aadhaarEncrypted,
      aadhaar_last_four: aadhaarLastFour,
      pan_number_encrypted: panEncrypted,
      pan_last_four: panLastFour,
      dob: dto.dob ? new Date(dto.dob) : undefined,
      age: dto.age,
      gender: dto.gender,
      occupation: dto.occupation,
      monthly_income_paise: dto.monthlyIncomePaise,
      work_or_business_details: dto.workOrBusinessDetails,
      address_line1: dto.addressLine1,
      address_line2: dto.addressLine2,
      city: dto.city,
      district: dto.district,
      state: dto.state,
      pincode: dto.pincode,
      photo_file_id: dto.photoFileId,
      assigned_officer_id: dto.assignedOfficerId,
      notes: dto.notes,
      created_by: actorId,
    });

    // Audit log
    await this.customerRepository.createAuditLog({
      action_type: 'customer_created',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'customer',
      target_id: customer.id,
      after_state: customer,
    });

    return {
      customer,
      duplicateWarnings: duplicateWarnings.length > 0 ? duplicateWarnings : undefined,
    };
  }

  async findById(id: string) {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }
    return customer;
  }

  async findAll(query: CustomerQueryDto, actorId: string, actorRole: string) {
    // Scope enforcement: field officers see only assigned customers
    const assignedOfficerId =
      !UNRESTRICTED_ROLES.includes(actorRole as UserRole)
        ? actorId
        : undefined;

    return this.customerRepository.findAll({
      skip: query.skip,
      take: query.take,
      status: query.status,
      search: query.search,
      riskLevel: query.riskLevel,
      assignedOfficerId,
    });
  }

  async update(
    id: string,
    dto: UpdateCustomerDto,
    actorId: string,
    actorRole: string,
  ) {
    const existing = await this.customerRepository.findById(id);
    if (!existing) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    // Scope enforcement: field officers can only update assigned customers
    if (
      !UNRESTRICTED_ROLES.includes(actorRole as UserRole) &&
      existing.assigned_officer_id !== actorId
    ) {
      throw new BusinessRuleError(
        'You can only update customers assigned to you',
        'SCOPE_VIOLATION',
      );
    }

    const updateData: UpdateCustomerData = {};

    if (dto.fullName !== undefined) updateData.full_name = dto.fullName;
    if (dto.fatherOrHusbandName !== undefined) updateData.father_or_husband_name = dto.fatherOrHusbandName;
    if (dto.mobile !== undefined) updateData.mobile = dto.mobile;
    if (dto.alternateMobile !== undefined) updateData.alternate_mobile = dto.alternateMobile;
    if (dto.panNumber !== undefined) {
      updateData.pan_number_encrypted = encryptField(dto.panNumber);
      updateData.pan_last_four = lastFour(dto.panNumber);
    }
    if (dto.dob !== undefined) updateData.dob = new Date(dto.dob);
    if (dto.age !== undefined) updateData.age = dto.age;
    if (dto.occupation !== undefined) updateData.occupation = dto.occupation;
    if (dto.monthlyIncomePaise !== undefined) updateData.monthly_income_paise = dto.monthlyIncomePaise;
    if (dto.workOrBusinessDetails !== undefined) updateData.work_or_business_details = dto.workOrBusinessDetails;
    if (dto.addressLine1 !== undefined) updateData.address_line1 = dto.addressLine1;
    if (dto.addressLine2 !== undefined) updateData.address_line2 = dto.addressLine2;
    if (dto.city !== undefined) updateData.city = dto.city;
    if (dto.district !== undefined) updateData.district = dto.district;
    if (dto.state !== undefined) updateData.state = dto.state;
    if (dto.pincode !== undefined) updateData.pincode = dto.pincode;
    if (dto.riskLevel !== undefined) updateData.risk_level = dto.riskLevel;
    if (dto.photoFileId !== undefined) updateData.photo_file_id = dto.photoFileId;
    if (dto.assignedOfficerId !== undefined) updateData.assigned_officer_id = dto.assignedOfficerId;
    if (dto.notes !== undefined) updateData.notes = dto.notes;

    const updated = await this.customerRepository.update(id, updateData);

    // Record before/after state in audit log
    await this.customerRepository.createAuditLog({
      action_type: 'customer_updated',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'customer',
      target_id: id,
      before_state: existing,
      after_state: updated,
    });

    return updated;
  }

  async blacklist(id: string, reason: string, actorId: string, actorRole: string) {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    if (customer.status === 'blacklisted') {
      throw new BusinessRuleError(
        'Customer is already blacklisted',
        'ALREADY_BLACKLISTED',
      );
    }

    const updated = await this.customerRepository.blacklist(id, reason, actorId);

    await this.customerRepository.createAuditLog({
      action_type: 'customer_blacklisted',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'customer',
      target_id: id,
      before_state: { status: customer.status },
      after_state: { status: 'blacklisted', reason },
      remarks: reason,
    });

    return updated;
  }

  async reinstate(id: string, reason: string, actorId: string, actorRole: string) {
    const customer = await this.customerRepository.findById(id);
    if (!customer) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    if (customer.status !== 'blacklisted') {
      throw new BusinessRuleError(
        'Only blacklisted customers can be reinstated',
        'NOT_BLACKLISTED',
      );
    }

    const updated = await this.customerRepository.reinstate(id);

    await this.customerRepository.createAuditLog({
      action_type: 'customer_reinstated',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'customer',
      target_id: id,
      before_state: { status: 'blacklisted' },
      after_state: { status: 'active' },
      remarks: reason,
    });

    return updated;
  }

  async addFamilyMember(customerId: string, dto: CreateFamilyMemberDto) {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    return this.customerRepository.createFamilyMember({
      customer_id: customerId,
      name: dto.name,
      relationship: dto.relationship,
      contact_number: dto.contactNumber,
      occupation: dto.occupation,
      income_contribution: dto.incomeContribution,
    });
  }

  async addGuarantor(customerId: string, dto: CreateGuarantorDto) {
    const customer = await this.customerRepository.findById(customerId);
    if (!customer) {
      throw new NotFoundError('Customer not found', 'CUSTOMER_NOT_FOUND');
    }

    // Validate Aadhaar format
    if (!/^\d{12}$/.test(dto.aadhaarNumber)) {
      throw new ValidationError('Aadhaar must be exactly 12 digits', 'INVALID_AADHAAR');
    }

    return this.customerRepository.createGuarantor({
      customer_id: customerId,
      name: dto.name,
      relationship: dto.relationship,
      mobile: dto.mobile,
      aadhaar_number_encrypted: encryptField(dto.aadhaarNumber),
      aadhaar_last_four: lastFour(dto.aadhaarNumber),
      address: dto.address,
      photo_file_id: dto.photoFileId,
    });
  }

  /**
   * Check for potential duplicates by Aadhaar last 4 or mobile.
   * Returns matching customers for Manager review.
   */
  async checkDuplicate(aadhaarLastFour?: string, mobile?: string) {
    const matches: Array<{ id: string; fullName: string; field: string }> = [];

    if (aadhaarLastFour) {
      const aadhaarMatches = await this.customerRepository.findByAadhaarLastFour(aadhaarLastFour);
      for (const c of aadhaarMatches) {
        matches.push({ id: c.id, fullName: c.full_name, field: 'aadhaar' });
      }
    }

    if (mobile) {
      const mobileMatches = await this.customerRepository.findByMobile(mobile);
      for (const c of mobileMatches) {
        if (!matches.some((m) => m.id === c.id)) {
          matches.push({ id: c.id, fullName: c.full_name, field: 'mobile' });
        }
      }
    }

    return { hasDuplicates: matches.length > 0, matches };
  }
}
