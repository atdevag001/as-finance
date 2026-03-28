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

  beforeEach(() => {
    vi.clearAllMocks();
    service = new LoanProductService(mockRepository as any);
    mockRepository.getSetting.mockResolvedValue(null);
    mockRepository.createAuditLog.mockResolvedValue({});
  });

  describe('create', () => {
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

    it('should create a loan product successfully', async () => {
      mockRepository.findByName.mockResolvedValue(null);
      mockRepository.createWithVersion.mockResolvedValue(mockProduct);

      const result = await service.create(validDto, mockActorId, 'manager');

      expect(result).toEqual(mockProduct);
      expect(mockRepository.createWithVersion).toHaveBeenCalled();
      expect(mockRepository.createAuditLog).toHaveBeenCalled();
    });

    it('should throw ConflictError for duplicate product name', async () => {
      mockRepository.findByName.mockResolvedValue(mockProduct);

      await expect(service.create(validDto, mockActorId, 'manager'))
        .rejects.toThrow(ConflictError);
    });

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

    it('should throw ValidationError for invalid allocation order', async () => {
      mockRepository.findByName.mockResolvedValue(null);

      await expect(
        service.create(
          { ...validDto, allocationOrder: ['penalty', 'interest'] },
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
  });

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
      expect(mockRepository.createNewVersion).toHaveBeenCalledWith(
        mockProductId,
        expect.objectContaining({ version_number: 2 }),
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
  });

  describe('deactivate', () => {
    it('should deactivate a product with no active loans', async () => {
      mockRepository.findById.mockResolvedValue(mockProduct);
      mockRepository.hasActiveLoans.mockResolvedValue(false);
      mockRepository.deactivate.mockResolvedValue({ ...mockProduct, is_active: false });

      const result = await service.deactivate(mockProductId, mockActorId, 'manager');

      expect(result.is_active).toBe(false);
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
});
