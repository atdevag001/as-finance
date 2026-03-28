import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserRole } from '@as-finance/shared';
import { CustomerService } from '../customer.service';
import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '../../../common/errors';

const mockCustomerId = '550e8400-e29b-41d4-a716-446655440000';
const mockActorId = '660e8400-e29b-41d4-a716-446655440001';

const mockCustomer = {
  id: mockCustomerId,
  full_name: 'Rajesh Kumar',
  father_or_husband_name: 'Suresh Kumar',
  mobile: '9876543210',
  alternate_mobile: null,
  aadhaar_last_four: '1234',
  pan_last_four: null,
  dob: null,
  age: 30,
  gender: 'male',
  occupation: 'Farmer',
  monthly_income_paise: null,
  work_or_business_details: null,
  address_line1: '123 Main St',
  address_line2: null,
  city: 'Jaipur',
  district: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302001',
  risk_level: 'medium',
  status: 'active',
  blacklist_reason: null,
  blacklisted_at: null,
  assigned_officer_id: mockActorId,
  photo_file_id: null,
  notes: null,
  version: 1,
  created_by: mockActorId,
  created_at: new Date(),
  updated_at: new Date(),
  family_members: [],
  guarantors: [],
};

function createMockRepository() {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findAll: vi.fn(),
    findByAadhaarLastFour: vi.fn(),
    findByMobile: vi.fn(),
    update: vi.fn(),
    blacklist: vi.fn(),
    reinstate: vi.fn(),
    createFamilyMember: vi.fn(),
    createGuarantor: vi.fn(),
    createAuditLog: vi.fn(),
  };
}

const validCreateDto = {
  fullName: 'Rajesh Kumar',
  fatherOrHusbandName: 'Suresh Kumar',
  mobile: '9876543210',
  aadhaarNumber: '123456781234',
  gender: 'male',
  addressLine1: '123 Main St',
  city: 'Jaipur',
  district: 'Jaipur',
  state: 'Rajasthan',
  pincode: '302001',
};

describe('CustomerService', () => {
  let service: CustomerService;
  let mockRepo: ReturnType<typeof createMockRepository>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepository();
    service = new CustomerService(mockRepo as never);
  });

  describe('create', () => {
    it('should create a customer with valid data and no duplicates', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([]);
      mockRepo.findByMobile.mockResolvedValue([]);
      mockRepo.create.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      const result = await service.create(
        validCreateDto as never,
        mockActorId,
        UserRole.FIELD_OFFICER,
      );

      expect(result.customer).toBeDefined();
      expect(result.customer.id).toBe(mockCustomerId);
      expect(result.duplicateWarnings).toBeUndefined();
      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          full_name: 'Rajesh Kumar',
          mobile: '9876543210',
          aadhaar_number_encrypted: 'enc_123456781234',
          aadhaar_last_four: '1234',
          gender: 'male',
          created_by: mockActorId,
        }),
      );
    });

    it('should encrypt Aadhaar and store last 4 digits', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([]);
      mockRepo.findByMobile.mockResolvedValue([]);
      mockRepo.create.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      await service.create(validCreateDto as never, mockActorId, UserRole.FIELD_OFFICER);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          aadhaar_number_encrypted: 'enc_123456781234',
          aadhaar_last_four: '1234',
        }),
      );
    });

    it('should encrypt PAN and store last 4 characters when provided', async () => {
      const dtoWithPan = { ...validCreateDto, panNumber: 'ABCDE1234F' };
      mockRepo.findByAadhaarLastFour.mockResolvedValue([]);
      mockRepo.findByMobile.mockResolvedValue([]);
      mockRepo.create.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      await service.create(dtoWithPan as never, mockActorId, UserRole.FIELD_OFFICER);

      expect(mockRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          pan_number_encrypted: 'enc_ABCDE1234F',
          pan_last_four: '234F',
        }),
      );
    });

    it('should default risk level to medium (handled by DB default)', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([]);
      mockRepo.findByMobile.mockResolvedValue([]);
      mockRepo.create.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      const result = await service.create(
        validCreateDto as never,
        mockActorId,
        UserRole.FIELD_OFFICER,
      );

      expect(result.customer.risk_level).toBe('medium');
    });

    it('should return duplicate warnings when Aadhaar matches', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([
        { id: 'existing-id', full_name: 'Existing Customer', mobile: '9999999999', aadhaar_last_four: '1234', status: 'active' },
      ]);
      mockRepo.findByMobile.mockResolvedValue([]);
      mockRepo.create.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      const result = await service.create(
        validCreateDto as never,
        mockActorId,
        UserRole.FIELD_OFFICER,
      );

      expect(result.duplicateWarnings).toBeDefined();
      expect(result.duplicateWarnings).toHaveLength(1);
      expect(result.duplicateWarnings?.[0]?.field).toBe('aadhaar');
    });

    it('should return duplicate warnings when mobile matches', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([]);
      mockRepo.findByMobile.mockResolvedValue([
        { id: 'existing-id', full_name: 'Existing Customer', mobile: '9876543210', aadhaar_last_four: '5678', status: 'active' },
      ]);
      mockRepo.create.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      const result = await service.create(
        validCreateDto as never,
        mockActorId,
        UserRole.FIELD_OFFICER,
      );

      expect(result.duplicateWarnings).toBeDefined();
      expect(result.duplicateWarnings).toHaveLength(1);
      expect(result.duplicateWarnings?.[0]?.field).toBe('mobile');
    });

    it('should return multiple duplicate warnings when both Aadhaar and mobile match', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([
        { id: 'existing-1', full_name: 'Customer A', mobile: '9111111111', aadhaar_last_four: '1234', status: 'active' },
      ]);
      mockRepo.findByMobile.mockResolvedValue([
        { id: 'existing-2', full_name: 'Customer B', mobile: '9876543210', aadhaar_last_four: '5678', status: 'active' },
      ]);
      mockRepo.create.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      const result = await service.create(
        validCreateDto as never,
        mockActorId,
        UserRole.FIELD_OFFICER,
      );

      expect(result.duplicateWarnings).toHaveLength(2);
    });

    it('should create audit log entry on creation', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([]);
      mockRepo.findByMobile.mockResolvedValue([]);
      mockRepo.create.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      await service.create(validCreateDto as never, mockActorId, UserRole.FIELD_OFFICER);

      expect(mockRepo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'customer_created',
          actor_id: mockActorId,
          actor_role: UserRole.FIELD_OFFICER,
          target_entity: 'customer',
          target_id: mockCustomerId,
        }),
      );
    });

    it('should reject invalid Aadhaar format', async () => {
      const invalidDto = { ...validCreateDto, aadhaarNumber: '12345' };

      await expect(
        service.create(invalidDto as never, mockActorId, UserRole.FIELD_OFFICER),
      ).rejects.toThrow(ValidationError);
    });

    it('should reject invalid PAN format', async () => {
      const invalidDto = { ...validCreateDto, panNumber: 'INVALID' };

      await expect(
        service.create(invalidDto as never, mockActorId, UserRole.FIELD_OFFICER),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('findById', () => {
    it('should return customer when found', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer);

      const result = await service.findById(mockCustomerId);
      expect(result).toEqual(mockCustomer);
    });

    it('should throw NotFoundError when customer not found', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.findById('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('findAll', () => {
    it('should return paginated customers for manager (no scope restriction)', async () => {
      const mockResult = { data: [mockCustomer], total: 1 };
      mockRepo.findAll.mockResolvedValue(mockResult);

      const result = await service.findAll(
        { skip: 0, take: 10 },
        mockActorId,
        UserRole.MANAGER,
      );

      expect(result).toEqual(mockResult);
      expect(mockRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedOfficerId: undefined,
        }),
      );
    });

    it('should scope field officer to assigned customers only', async () => {
      const mockResult = { data: [mockCustomer], total: 1 };
      mockRepo.findAll.mockResolvedValue(mockResult);

      await service.findAll({ skip: 0, take: 10 }, mockActorId, UserRole.FIELD_OFFICER);

      expect(mockRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedOfficerId: mockActorId,
        }),
      );
    });

    it('should not scope super_admin', async () => {
      mockRepo.findAll.mockResolvedValue({ data: [], total: 0 });

      await service.findAll({}, mockActorId, UserRole.SUPER_ADMIN);

      expect(mockRepo.findAll).toHaveBeenCalledWith(
        expect.objectContaining({
          assignedOfficerId: undefined,
        }),
      );
    });
  });

  describe('update', () => {
    it('should update customer and record audit log', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer);
      const updatedCustomer = { ...mockCustomer, full_name: 'Updated Name' };
      mockRepo.update.mockResolvedValue(updatedCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      const result = await service.update(
        mockCustomerId,
        { fullName: 'Updated Name' },
        mockActorId,
        UserRole.MANAGER,
      );

      expect(result.full_name).toBe('Updated Name');
      expect(mockRepo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'customer_updated',
          before_state: mockCustomer,
          after_state: updatedCustomer,
        }),
      );
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { fullName: 'Test' }, mockActorId, UserRole.MANAGER),
      ).rejects.toThrow(NotFoundError);
    });

    it('should prevent field officer from updating unassigned customer', async () => {
      const unassignedCustomer = { ...mockCustomer, assigned_officer_id: 'other-officer-id' };
      mockRepo.findById.mockResolvedValue(unassignedCustomer);

      await expect(
        service.update(mockCustomerId, { fullName: 'Test' }, mockActorId, UserRole.FIELD_OFFICER),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should allow field officer to update assigned customer', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer);
      mockRepo.update.mockResolvedValue(mockCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      await expect(
        service.update(mockCustomerId, { fullName: 'Test' }, mockActorId, UserRole.FIELD_OFFICER),
      ).resolves.toBeDefined();
    });
  });

  describe('blacklist', () => {
    it('should blacklist an active customer', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer);
      const blacklistedCustomer = { ...mockCustomer, status: 'blacklisted', blacklist_reason: 'Fraud' };
      mockRepo.blacklist.mockResolvedValue(blacklistedCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      const result = await service.blacklist(
        mockCustomerId,
        'Fraud',
        mockActorId,
        UserRole.MANAGER,
      );

      expect(result.status).toBe('blacklisted');
      expect(mockRepo.blacklist).toHaveBeenCalledWith(mockCustomerId, 'Fraud', mockActorId);
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.blacklist('nonexistent', 'Fraud', mockActorId, UserRole.MANAGER),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError if already blacklisted', async () => {
      const blacklistedCustomer = { ...mockCustomer, status: 'blacklisted' };
      mockRepo.findById.mockResolvedValue(blacklistedCustomer);

      await expect(
        service.blacklist(mockCustomerId, 'Fraud', mockActorId, UserRole.MANAGER),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should create audit log entry on blacklisting', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer);
      mockRepo.blacklist.mockResolvedValue({ ...mockCustomer, status: 'blacklisted' });
      mockRepo.createAuditLog.mockResolvedValue({});

      await service.blacklist(mockCustomerId, 'Fraud', mockActorId, UserRole.MANAGER);

      expect(mockRepo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'customer_blacklisted',
          remarks: 'Fraud',
        }),
      );
    });
  });

  describe('reinstate', () => {
    it('should reinstate a blacklisted customer', async () => {
      const blacklistedCustomer = { ...mockCustomer, status: 'blacklisted' };
      mockRepo.findById.mockResolvedValue(blacklistedCustomer);
      const reinstatedCustomer = { ...mockCustomer, status: 'active' };
      mockRepo.reinstate.mockResolvedValue(reinstatedCustomer);
      mockRepo.createAuditLog.mockResolvedValue({});

      const result = await service.reinstate(
        mockCustomerId,
        'Cleared after review',
        mockActorId,
        UserRole.MANAGER,
      );

      expect(result.status).toBe('active');
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.reinstate('nonexistent', 'Reason', mockActorId, UserRole.MANAGER),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError if customer is not blacklisted', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer); // status: 'active'

      await expect(
        service.reinstate(mockCustomerId, 'Reason', mockActorId, UserRole.MANAGER),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should create audit log entry on reinstatement', async () => {
      const blacklistedCustomer = { ...mockCustomer, status: 'blacklisted' };
      mockRepo.findById.mockResolvedValue(blacklistedCustomer);
      mockRepo.reinstate.mockResolvedValue({ ...mockCustomer, status: 'active' });
      mockRepo.createAuditLog.mockResolvedValue({});

      await service.reinstate(mockCustomerId, 'Cleared', mockActorId, UserRole.MANAGER);

      expect(mockRepo.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'customer_reinstated',
          remarks: 'Cleared',
        }),
      );
    });
  });

  describe('addFamilyMember', () => {
    it('should add a family member to an existing customer', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer);
      const familyMember = {
        id: 'fm-1',
        customer_id: mockCustomerId,
        name: 'Sunita Kumar',
        relationship: 'spouse',
        contact_number: '9876543211',
        occupation: null,
        income_contribution: null,
        created_at: new Date(),
      };
      mockRepo.createFamilyMember.mockResolvedValue(familyMember);

      const result = await service.addFamilyMember(mockCustomerId, {
        name: 'Sunita Kumar',
        relationship: 'spouse',
        contactNumber: '9876543211',
      });

      expect(result.name).toBe('Sunita Kumar');
      expect(result.relationship).toBe('spouse');
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.addFamilyMember('nonexistent', {
          name: 'Test',
          relationship: 'father',
        }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('addGuarantor', () => {
    it('should add a guarantor with encrypted Aadhaar', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer);
      const guarantor = {
        id: 'g-1',
        customer_id: mockCustomerId,
        name: 'Mohan Lal',
        relationship: 'friend',
        mobile: '9876543212',
        aadhaar_last_four: '5678',
        address: '456 Other St',
        photo_file_id: null,
        created_at: new Date(),
      };
      mockRepo.createGuarantor.mockResolvedValue(guarantor);

      const result = await service.addGuarantor(mockCustomerId, {
        name: 'Mohan Lal',
        relationship: 'friend',
        mobile: '9876543212',
        aadhaarNumber: '567890125678',
        address: '456 Other St',
      });

      expect(result.name).toBe('Mohan Lal');
      expect(mockRepo.createGuarantor).toHaveBeenCalledWith(
        expect.objectContaining({
          aadhaar_number_encrypted: 'enc_567890125678',
          aadhaar_last_four: '5678',
        }),
      );
    });

    it('should throw NotFoundError for non-existent customer', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(
        service.addGuarantor('nonexistent', {
          name: 'Test',
          relationship: 'friend',
          mobile: '9876543212',
          aadhaarNumber: '567890125678',
          address: '456 Other St',
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it('should reject invalid Aadhaar format for guarantor', async () => {
      mockRepo.findById.mockResolvedValue(mockCustomer);

      await expect(
        service.addGuarantor(mockCustomerId, {
          name: 'Test',
          relationship: 'friend',
          mobile: '9876543212',
          aadhaarNumber: '12345',
          address: '456 Other St',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('checkDuplicate', () => {
    it('should return no duplicates when none found', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([]);
      mockRepo.findByMobile.mockResolvedValue([]);

      const result = await service.checkDuplicate('1234', '9876543210');

      expect(result.hasDuplicates).toBe(false);
      expect(result.matches).toHaveLength(0);
    });

    it('should return duplicates when Aadhaar matches', async () => {
      mockRepo.findByAadhaarLastFour.mockResolvedValue([
        { id: 'existing-id', full_name: 'Existing', mobile: '9999999999', aadhaar_last_four: '1234', status: 'active' },
      ]);
      mockRepo.findByMobile.mockResolvedValue([]);

      const result = await service.checkDuplicate('1234');

      expect(result.hasDuplicates).toBe(true);
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0]?.field).toBe('aadhaar');
    });

    it('should deduplicate when same customer matches both Aadhaar and mobile', async () => {
      const existingCustomer = { id: 'existing-id', full_name: 'Existing', mobile: '9876543210', aadhaar_last_four: '1234', status: 'active' };
      mockRepo.findByAadhaarLastFour.mockResolvedValue([existingCustomer]);
      mockRepo.findByMobile.mockResolvedValue([existingCustomer]);

      const result = await service.checkDuplicate('1234', '9876543210');

      expect(result.hasDuplicates).toBe(true);
      expect(result.matches).toHaveLength(1);
    });
  });
});
