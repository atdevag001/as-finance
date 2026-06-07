import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoanProductService } from '../loan-product.service';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../common/errors';

const mockProductId = '550e8400-e29b-41d4-a716-446655440000';
const mockVersionId = '660e8400-e29b-41d4-a716-446655440001';
const mockActorId = '770e8400-e29b-41d4-a716-446655440002';

const mockVersion = {
  id: mockVersionId,
  product_id: mockProductId,
  version_number: 1,
  interest_type: 'flat',
  annual_rate_bps: 1200,
  min_principal_paise: BigInt(1000000),
  max_principal_paise: BigInt(50000000),
  min_tenure_months: 3,
  max_tenure_months: 36,
  repayment_frequency: 'monthly',
  processing_fee_type: null,
  processing_fee_value: null,
  penalty_grace_days: 7,
  penalty_type: null,
  penalty_value: null,
  penalty_frequency: null,
  max_concurrent_loans: 1,
  allocation_order: ['penalty', 'interest', 'principal'],
  is_active: true,
  created_at: new Date(),
};

const mockProduct = {
  id: mockProductId,
  name: 'Test Product',
  is_active: true,
  current_version_id: mockVersionId,
  created_by: mockActorId,
  created_at: new Date(),
  updated_at: new Date(),
  current_version: mockVersion,
  versions: [mockVersion],
};

const mockRepository = {
  findByName: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  createWithVersion: vi.fn(),
  createNewVersion: vi.fn(),
  getLatestVersionNumber: vi.fn(),
  hasActiveLoans: vi.fn(),
  deactivate: vi.fn(),
  getSetting: vi.fn(),
  createAuditLog: vi.fn(),
};

describe('LoanProductService', () => {
  let service: LoanProductService;

  const validDto = {
    name: 'Test Product',
    interestType: 'flat' as const,
    annualRateBps: 1200,
    minPrincipalPaise: 1000000,
    maxPrincipalPaise: 50000000,
    minTenureMonths: 3,
    maxTenureMonths: 36,
    repaymentFrequency: 'monthly' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LoanProductService(mockRepository as any);
    mockRepository.getSetting.mockResolvedValue(null);
    mockRepository.createAuditLog.mockResolvedValue({});
  });

  // ── Requirement 20.1: Creation with valid configuration ──────────────

  describe('create', () => {
    it('should create a loan product successfully', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      const result = await service.create(validDto, mockActorId, 'manager');

      expect(result).toEqual(mockProduct);
      expect(mockRepository.createWithVersion).toHaveBeenCalledWith(
        { name: validDto.name, created_by: mockActorId },
        expect.objectContaining({
          interest_type: 'flat',
          annual_rate_bps: 1200,
          min_principal_paise: 1000000,
          max_principal_paise: 50000000,
          repayment_frequency: 'monthly',
          allocation_order: ['penalty', 'interest', 'principal'],
        }),
      );
    });

    it('should create an audit log on successful creation', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      await service.create(validDto, mockActorId, 'manager');

      expect(mockRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action_type: 'loan_product_created',
          actor_id: mockActorId,
          actor_role: 'manager',
          target_entity: 'loan_product',
          target_id: mockProductId,
        }),
      );
    });

    it('should use default allocation order when not provided', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      await service.create(validDto, mockActorId, 'manager');

      expect(mockRepository.createWithVersion).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          allocation_order: ['penalty', 'interest', 'principal'],
        }),
      );
    });

    it('should accept custom allocation order', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      await service.create(
        { ...validDto, allocationOrder: ['interest', 'principal', 'penalty'] },
        mockActorId,
        'manager',
      );

      expect(mockRepository.createWithVersion).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          allocation_order: ['interest', 'principal', 'penalty'],
        }),
      );
    });

    it('should set optional fields to defaults when not provided', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      await service.create(validDto, mockActorId, 'manager');

      expect(mockRepository.createWithVersion).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          processing_fee_type: null,
          processing_fee_value: null,
          penalty_grace_days: 0,
          penalty_type: null,
          penalty_value: null,
          penalty_frequency: null,
          max_concurrent_loans: 1,
        }),
      );
    });

    it('should throw ConflictError for duplicate product name', async () => {
      mockRepository.findByName.mockResolvedValue(mockProduct);

      await expect(service.create(validDto, mockActorId, 'manager'))
        .rejects.toThrow(ConflictError);
    });
  });

  // ── Requirement 20.6: Parameter validation ────────────────────────────

  describe('create — parameter validation', () => {
    it('should throw ValidationError when min principal > max principal', async () => {
      mockRepository.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          { ...validDto, minPrincipalPaise: 100000000, maxPrincipalPaise: 1000000 },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when min tenure > max tenure', async () => {
      mockRepository.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          { ...validDto, minTenureMonths: 36, maxTenureMonths: 3 },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when rate exceeds system max', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.getSetting.mockImplementation((key: string) => {
        if (key === 'max_annual_rate_bps') return Promise.resolve(3600);
        if (key === 'min_annual_rate_bps') return Promise.resolve(100);
        return Promise.resolve(null);
      });

      await expect(
        service.create({ ...validDto, annualRateBps: 5000 }, mockActorId, 'manager'),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when rate is below system min', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.getSetting.mockImplementation((key: string) => {
        if (key === 'max_annual_rate_bps') return Promise.resolve(3600);
        if (key === 'min_annual_rate_bps') return Promise.resolve(500);
        return Promise.resolve(null);
      });

      await expect(
        service.create({ ...validDto, annualRateBps: 100 }, mockActorId, 'manager'),
      ).rejects.toThrow(ValidationError);
    });

    it('should pass rate validation when no system bounds are configured', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.getSetting.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      const result = await service.create(validDto, mockActorId, 'manager');
      expect(result).toEqual(mockProduct);
    });

    it('should throw ValidationError for invalid allocation order (missing component)', async () => {
      mockRepository.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          { ...validDto, allocationOrder: ['penalty', 'interest'] },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for allocation order with invalid components', async () => {
      mockRepository.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          { ...validDto, allocationOrder: ['penalty', 'interest', 'fees'] },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when processing fee type set without value', async () => {
      mockRepository.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          { ...validDto, processingFeeType: 'fixed' as const },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when penalty type set without value', async () => {
      mockRepository.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          { ...validDto, penaltyType: 'flat_per_period' as const },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError when penalty type set without frequency', async () => {
      mockRepository.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          { ...validDto, penaltyType: 'flat_per_period' as const, penaltyValue: 500 },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should accept valid penalty configuration', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      await service.create(
        {
          ...validDto,
          penaltyType: 'flat_per_period' as const,
          penaltyValue: 500,
          penaltyFrequency: 'daily' as const,
          penaltyGraceDays: 7,
        },
        mockActorId,
        'manager',
      );

      expect(mockRepository.createWithVersion).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          penalty_type: 'flat_per_period',
          penalty_value: 500,
          penalty_frequency: 'daily',
          penalty_grace_days: 7,
        }),
      );
    });

    it('should accept valid processing fee configuration', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      await service.create(
        { ...validDto, processingFeeType: 'percentage' as const, processingFeeValue: 200 },
        mockActorId,
        'manager',
      );

      expect(mockRepository.createWithVersion).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          processing_fee_type: 'percentage',
          processing_fee_value: 200,
        }),
      );
    });
  });

  // ── Requirement 20.2: Version immutability (update creates new version) ──
  // ── Requirement 20.4: Version auto-increment ─────────────────────────

  describe('update', () => {
    it('should create a new version on update', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.getLatestVersionNumber.mockResolvedValue(1);
      mockRepository.createNewVersion.mockResolvedValue({
        ...mockProduct,
        current_version: { ...mockVersion, version_number: 2, annual_rate_bps: 1500 },
      });

      const result = await service.update(
        mockProductId,
        { annualRateBps: 1500 },
        mockActorId,
        'manager',
      );

      expect(result.current_version.annual_rate_bps).toBe(1500);
      expect(result.current_version.version_number).toBe(2);
      expect(mockRepository.createNewVersion).toHaveBeenCalledWith(
        mockProductId,
        expect.objectContaining({ version_number: 2 }),
      );
    });

    it('should auto-increment version number from latest', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.getLatestVersionNumber.mockResolvedValue(5);
      mockRepository.createNewVersion.mockResolvedValue({
        ...mockProduct,
        current_version: { ...mockVersion, version_number: 6 },
      });

      await service.update(mockProductId, { annualRateBps: 1500 }, mockActorId, 'manager');

      expect(mockRepository.createNewVersion).toHaveBeenCalledWith(
        mockProductId,
        expect.objectContaining({ version_number: 6 }),
      );
    });

    it('should merge current version values with partial update DTO', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.getLatestVersionNumber.mockResolvedValue(1);
      mockRepository.createNewVersion.mockResolvedValue({
        ...mockProduct,
        current_version: { ...mockVersion, version_number: 2, annual_rate_bps: 1800 },
      });

      await service.update(mockProductId, { annualRateBps: 1800 }, mockActorId, 'manager');

      // Should carry forward all existing values and only change annualRateBps
      expect(mockRepository.createNewVersion).toHaveBeenCalledWith(
        mockProductId,
        expect.objectContaining({
          interest_type: 'flat',
          annual_rate_bps: 1800,
          min_tenure_months: 3,
          max_tenure_months: 36,
          repayment_frequency: 'monthly',
        }),
      );
    });

    it('should create audit log on update', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.getLatestVersionNumber.mockResolvedValue(1);
      mockRepository.createNewVersion.mockResolvedValue({
        ...mockProduct,
        current_version: { ...mockVersion, version_number: 2 },
      });

      await service.update(mockProductId, { annualRateBps: 1500 }, mockActorId, 'manager');

      expect(mockRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_id: mockActorId,
          target_entity: 'loan_product',
          target_id: mockProductId,
          remarks: 'Created version 2',
        }),
      );
    });

    it('should throw NotFoundError for non-existent product', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        service.update(mockProductId, { annualRateBps: 1500 }, mockActorId, 'manager'),
      ).rejects.toThrow(NotFoundError);
    });

    it('should throw BusinessRuleError for deactivated product', async () => {
      mockRepository.findById.mockResolvedValue({ ...mockProduct, is_active: false });

      await expect(
        service.update(mockProductId, { annualRateBps: 1500 }, mockActorId, 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError when product has no current version', async () => {
      mockRepository.findById.mockResolvedValue({
        ...mockProduct,
        current_version: null,
      });

      await expect(
        service.update(mockProductId, { annualRateBps: 1500 }, mockActorId, 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should validate merged principal range on update', async () => {
      // Current version has min=1000000, max=50000000
      // Update only minPrincipalPaise to exceed max
      mockRepository.findById.mockResolvedValue(mockProduct);

      await expect(
        service.update(
          mockProductId,
          { minPrincipalPaise: 100000000 },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should validate merged tenure range on update', async () => {
      // Current version has min=3, max=36
      // Update only minTenureMonths to exceed max
      mockRepository.findById.mockResolvedValue(mockProduct);

      await expect(
        service.update(
          mockProductId,
          { minTenureMonths: 48 },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });

    it('should validate merged rate bounds on update', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.getSetting.mockImplementation((key: string) => {
        if (key === 'max_annual_rate_bps') return Promise.resolve(3600);
        return Promise.resolve(null);
      });

      await expect(
        service.update(mockProductId, { annualRateBps: 5000 }, mockActorId, 'manager'),
      ).rejects.toThrow(ValidationError);
    });

    it('should validate allocation order on update', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);

      await expect(
        service.update(
          mockProductId,
          { allocationOrder: ['penalty'] },
          mockActorId,
          'manager',
        ),
      ).rejects.toThrow(ValidationError);
    });
  });

  // ── Requirement 20.3: Deactivation ────────────────────────────────────

  describe('deactivate', () => {
    it('should deactivate a product with no active loans', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.hasActiveLoans.mockResolvedValue(false);
      mockRepository.deactivate.mockResolvedValue({ ...mockProduct, is_active: false });

      const result = await service.deactivate(mockProductId, mockActorId, 'manager');

      expect(result.is_active).toBe(false);
      expect(mockRepository.deactivate).toHaveBeenCalledWith(mockProductId);
    });

    it('should create audit log on deactivation', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.hasActiveLoans.mockResolvedValue(false);
      mockRepository.deactivate.mockResolvedValue({ ...mockProduct, is_active: false });

      await service.deactivate(mockProductId, mockActorId, 'manager');

      expect(mockRepository.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          actor_id: mockActorId,
          target_entity: 'loan_product',
          target_id: mockProductId,
          before_state: { is_active: true },
          after_state: { is_active: false },
          remarks: 'Product deactivated',
        }),
      );
    });

    it('should throw BusinessRuleError when active loans exist', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.hasActiveLoans.mockResolvedValue(true);

      await expect(
        service.deactivate(mockProductId, mockActorId, 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw BusinessRuleError for already deactivated product', async () => {
      mockRepository.findById.mockResolvedValue({ ...mockProduct, is_active: false });

      await expect(
        service.deactivate(mockProductId, mockActorId, 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should throw NotFoundError for non-existent product', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(
        service.deactivate(mockProductId, mockActorId, 'manager'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ── Requirement 20.5: Pagination and filtering ───────────────────────

  describe('findAll', () => {
    it('should return paginated results', async () => {
      const paginatedResult = {
        data: [mockProduct],
        total: 1,
      };
      mockRepository.findAll.mockResolvedValue(paginatedResult);

      const result = await service.findAll({ skip: 0, take: 10 });

      expect(result).toEqual(paginatedResult);
      expect(mockRepository.findAll).toHaveBeenCalledWith({ skip: 0, take: 10 });
    });

    it('should pass active filter to repository', async () => {
      mockRepository.findAll.mockResolvedValue({ data: [], total: 0 });

      await service.findAll({ isActive: true });

      expect(mockRepository.findAll).toHaveBeenCalledWith({ isActive: true });
    });

    it('should pass inactive filter to repository', async () => {
      mockRepository.findAll.mockResolvedValue({ data: [], total: 0 });

      await service.findAll({ isActive: false });

      expect(mockRepository.findAll).toHaveBeenCalledWith({ isActive: false });
    });

    it('should return empty result when no products exist', async () => {
      mockRepository.findAll.mockResolvedValue({ data: [], total: 0 });

      const result = await service.findAll({});

      expect(result.data).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should pass pagination params through to repository', async () => {
      mockRepository.findAll.mockResolvedValue({ data: [], total: 0 });

      await service.findAll({ skip: 20, take: 5, isActive: true });

      expect(mockRepository.findAll).toHaveBeenCalledWith({
        skip: 20,
        take: 5,
        isActive: true,
      });
    });
  });

  // ── findById ─────────────────────────────────────────────────────────

  describe('findById', () => {
    it('should return product when found', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);

      const result = await service.findById(mockProductId);
      expect(result).toEqual(mockProduct);
    });

    it('should throw NotFoundError when not found', async () => {
      mockRepository.findById.mockResolvedValue(null);

      await expect(service.findById(mockProductId)).rejects.toThrow(NotFoundError);
    });
  });

  // ── validateRateBounds (internal, tested via create/update) ──────────

  describe('validateRateBounds', () => {
    it('should pass when no system bounds are configured', async () => {
      mockRepository.getSetting.mockResolvedValue(null);

      await expect(service.validateRateBounds(5000)).resolves.toBeUndefined();
    });

    it('should pass when rate is within bounds', async () => {
      mockRepository.getSetting.mockImplementation((key: string) => {
        if (key === 'max_annual_rate_bps') return Promise.resolve(3600);
        if (key === 'min_annual_rate_bps') return Promise.resolve(100);
        return Promise.resolve(null);
      });

      await expect(service.validateRateBounds(1200)).resolves.toBeUndefined();
    });

    it('should throw when rate exceeds maximum', async () => {
      mockRepository.getSetting.mockImplementation((key: string) => {
        if (key === 'max_annual_rate_bps') return Promise.resolve(3600);
        return Promise.resolve(null);
      });

      await expect(service.validateRateBounds(5000)).rejects.toThrow(ValidationError);
    });

    it('should throw when rate is below minimum', async () => {
      mockRepository.getSetting.mockImplementation((key: string) => {
        if (key === 'min_annual_rate_bps') return Promise.resolve(500);
        return Promise.resolve(null);
      });

      await expect(service.validateRateBounds(100)).rejects.toThrow(ValidationError);
    });

    it('should throw BusinessRuleError when setting is present but unusable', async () => {
      mockRepository.getSetting.mockResolvedValue('not-a-number');

      await expect(service.validateRateBounds(5000)).rejects.toThrow(BusinessRuleError);
    });

    it('should coerce numeric strings stored in settings.value', async () => {
      mockRepository.getSetting.mockImplementation((key: string) => {
        if (key === 'max_annual_rate_bps') return Promise.resolve('3600');
        return Promise.resolve(null);
      });

      await expect(service.validateRateBounds(5000)).rejects.toThrow(ValidationError);
      await expect(service.validateRateBounds(1200)).resolves.toBeUndefined();
    });

    it('should coerce objects with a numeric value/amount/bps field', async () => {
      mockRepository.getSetting.mockImplementation((key: string) => {
        if (key === 'max_annual_rate_bps') return Promise.resolve({ value: 3600 });
        if (key === 'min_annual_rate_bps') return Promise.resolve({ amount: 500 });
        return Promise.resolve(null);
      });

      await expect(service.validateRateBounds(5000)).rejects.toThrow(ValidationError);
      await expect(service.validateRateBounds(100)).rejects.toThrow(ValidationError);
      await expect(service.validateRateBounds(1200)).resolves.toBeUndefined();
    });
  });
});
