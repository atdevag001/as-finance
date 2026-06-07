import { Injectable, Logger } from '@nestjs/common';
import { LoanProductRepository } from './loan-product.repository';
import { CreateLoanProductDto } from './dto/create-loan-product.dto';
import { UpdateLoanProductDto } from './dto/update-loan-product.dto';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';

const DEFAULT_ALLOCATION_ORDER = ['penalty', 'interest', 'principal'];
const VALID_ALLOCATION_COMPONENTS = ['penalty', 'interest', 'principal'];

@Injectable()
export class LoanProductService {
  private readonly logger = new Logger(LoanProductService.name);

  constructor(private readonly loanProductRepository: LoanProductRepository) {}

  async create(dto: CreateLoanProductDto, actorId: string, actorRole: string) {
    // Validate product name uniqueness
    const existing = await this.loanProductRepository.findByName(dto.name);
    if (existing) {
      throw new ConflictError(
        `Loan product with name "${dto.name}" already exists`,
        'PRODUCT_NAME_EXISTS',
      );
    }

    // Validate principal range
    if (dto.minPrincipalPaise > dto.maxPrincipalPaise) {
      throw new ValidationError(
        'Minimum principal must be less than or equal to maximum principal',
        'INVALID_PRINCIPAL_RANGE',
      );
    }

    // Validate tenure range
    if (dto.minTenureMonths > dto.maxTenureMonths) {
      throw new ValidationError(
        'Minimum tenure must be less than or equal to maximum tenure',
        'INVALID_TENURE_RANGE',
      );
    }

    // Validate rate within system-configured bounds
    await this.validateRateBounds(dto.annualRateBps);

    // Validate allocation order if provided
    const allocationOrder = dto.allocationOrder ?? DEFAULT_ALLOCATION_ORDER;
    this.validateAllocationOrder(allocationOrder);

    // Validate processing fee consistency
    if (dto.processingFeeType && dto.processingFeeValue === undefined) {
      throw new ValidationError(
        'Processing fee value is required when fee type is specified',
        'MISSING_PROCESSING_FEE_VALUE',
      );
    }

    // Validate penalty config consistency
    if (dto.penaltyType && dto.penaltyValue === undefined) {
      throw new ValidationError(
        'Penalty value is required when penalty type is specified',
        'MISSING_PENALTY_VALUE',
      );
    }
    if (dto.penaltyType && !dto.penaltyFrequency) {
      throw new ValidationError(
        'Penalty frequency is required when penalty type is specified',
        'MISSING_PENALTY_FREQUENCY',
      );
    }

    let product;
    try {
      product = await this.loanProductRepository.createWithVersion(
        { name: dto.name, created_by: actorId },
        {
          interest_type: dto.interestType,
          annual_rate_bps: dto.annualRateBps,
          min_principal_paise: dto.minPrincipalPaise,
          max_principal_paise: dto.maxPrincipalPaise,
          min_tenure_months: dto.minTenureMonths,
          max_tenure_months: dto.maxTenureMonths,
          repayment_frequency: dto.repaymentFrequency,
          processing_fee_type: dto.processingFeeType ?? null,
          processing_fee_value: dto.processingFeeValue ?? null,
          penalty_grace_days: dto.penaltyGraceDays ?? 0,
          penalty_type: dto.penaltyType ?? null,
          penalty_value: dto.penaltyValue ?? null,
          penalty_frequency: dto.penaltyFrequency ?? null,
          max_concurrent_loans: dto.maxConcurrentLoans ?? 1,
          allocation_order: allocationOrder,
        },
      );
    } catch (e: unknown) {
      // Translate the DB unique-constraint loser of a concurrent create race into the same 409 the pre-check returns.
      if (typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002') {
        throw new ConflictError(
          `Loan product with name "${dto.name}" already exists`,
          'PRODUCT_NAME_EXISTS',
        );
      }
      throw e;
    }

    await this.loanProductRepository.createAuditLog({
      action_type: 'loan_product_created',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan_product',
      target_id: product.id,
      after_state: product,
    });

    return product;
  }

  async update(id: string, dto: UpdateLoanProductDto, actorId: string, actorRole: string) {
    const product = await this.loanProductRepository.findById(id);
    if (!product) {
      throw new NotFoundError('Loan product not found', 'PRODUCT_NOT_FOUND');
    }

    if (!product.is_active) {
      throw new BusinessRuleError(
        'Cannot update a deactivated loan product',
        'PRODUCT_DEACTIVATED',
      );
    }

    const currentVersion = product.current_version;
    if (!currentVersion) {
      throw new BusinessRuleError(
        'Loan product has no current version',
        'NO_CURRENT_VERSION',
      );
    }

    // Merge current version values with update DTO
    const mergedInterestType = dto.interestType ?? currentVersion.interest_type;
    const mergedAnnualRateBps = dto.annualRateBps ?? currentVersion.annual_rate_bps;
    const mergedMinPrincipal = dto.minPrincipalPaise ?? Number(currentVersion.min_principal_paise);
    const mergedMaxPrincipal = dto.maxPrincipalPaise ?? Number(currentVersion.max_principal_paise);
    const mergedMinTenure = dto.minTenureMonths ?? currentVersion.min_tenure_months;
    const mergedMaxTenure = dto.maxTenureMonths ?? currentVersion.max_tenure_months;
    const mergedFrequency = dto.repaymentFrequency ?? currentVersion.repayment_frequency;
    const mergedProcessingFeeType = dto.processingFeeType !== undefined
      ? dto.processingFeeType
      : currentVersion.processing_fee_type;
    const mergedProcessingFeeValue = dto.processingFeeValue !== undefined
      ? dto.processingFeeValue
      : currentVersion.processing_fee_value;
    const mergedPenaltyGraceDays = dto.penaltyGraceDays ?? currentVersion.penalty_grace_days;
    const mergedPenaltyType = dto.penaltyType !== undefined
      ? dto.penaltyType
      : currentVersion.penalty_type;
    const mergedPenaltyValue = dto.penaltyValue !== undefined
      ? dto.penaltyValue
      : currentVersion.penalty_value;
    const mergedPenaltyFrequency = dto.penaltyFrequency !== undefined
      ? dto.penaltyFrequency
      : currentVersion.penalty_frequency;
    const mergedMaxConcurrentLoans = dto.maxConcurrentLoans ?? currentVersion.max_concurrent_loans;
    const mergedAllocationOrder = dto.allocationOrder ?? (currentVersion.allocation_order as string[]);

    // Validate principal range
    if (mergedMinPrincipal > mergedMaxPrincipal) {
      throw new ValidationError(
        'Minimum principal must be less than or equal to maximum principal',
        'INVALID_PRINCIPAL_RANGE',
      );
    }

    // Validate tenure range
    if (mergedMinTenure > mergedMaxTenure) {
      throw new ValidationError(
        'Minimum tenure must be less than or equal to maximum tenure',
        'INVALID_TENURE_RANGE',
      );
    }

    // Validate rate within system-configured bounds
    await this.validateRateBounds(mergedAnnualRateBps);

    // Validate allocation order
    this.validateAllocationOrder(mergedAllocationOrder);

    // Re-check create-time consistency on merged values; partial DTOs can otherwise
    // leave the new version with type set but value/frequency null (crashes downstream).
    if (mergedProcessingFeeType && mergedProcessingFeeValue == null) {
      throw new ValidationError(
        'Processing fee value is required when fee type is specified',
        'MISSING_PROCESSING_FEE_VALUE',
      );
    }
    if (mergedPenaltyType && mergedPenaltyValue == null) {
      throw new ValidationError(
        'Penalty value is required when penalty type is specified',
        'MISSING_PENALTY_VALUE',
      );
    }
    if (mergedPenaltyType && !mergedPenaltyFrequency) {
      throw new ValidationError(
        'Penalty frequency is required when penalty type is specified',
        'MISSING_PENALTY_FREQUENCY',
      );
    }

    // Get next version number
    const latestVersionNumber = await this.loanProductRepository.getLatestVersionNumber(id);
    const newVersionNumber = latestVersionNumber + 1;

    const updatedProduct = await this.loanProductRepository.createNewVersion(id, {
      version_number: newVersionNumber,
      interest_type: mergedInterestType,
      annual_rate_bps: mergedAnnualRateBps,
      min_principal_paise: mergedMinPrincipal,
      max_principal_paise: mergedMaxPrincipal,
      min_tenure_months: mergedMinTenure,
      max_tenure_months: mergedMaxTenure,
      repayment_frequency: mergedFrequency,
      processing_fee_type: mergedProcessingFeeType,
      processing_fee_value: mergedProcessingFeeValue,
      penalty_grace_days: mergedPenaltyGraceDays,
      penalty_type: mergedPenaltyType,
      penalty_value: mergedPenaltyValue,
      penalty_frequency: mergedPenaltyFrequency,
      max_concurrent_loans: mergedMaxConcurrentLoans,
      allocation_order: mergedAllocationOrder,
    });

    await this.loanProductRepository.createAuditLog({
      action_type: 'loan_product_updated',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan_product',
      target_id: id,
      before_state: { version: currentVersion },
      after_state: updatedProduct,
      remarks: `Created version ${newVersionNumber}`,
    });

    return updatedProduct;
  }

  async findById(id: string) {
    const product = await this.loanProductRepository.findById(id);
    if (!product) {
      throw new NotFoundError('Loan product not found', 'PRODUCT_NOT_FOUND');
    }
    return product;
  }

  async findAll(params: { skip?: number; take?: number; isActive?: boolean }) {
    return this.loanProductRepository.findAll(params);
  }

  async deactivate(id: string, actorId: string, actorRole: string) {
    const product = await this.loanProductRepository.findById(id);
    if (!product) {
      throw new NotFoundError('Loan product not found', 'PRODUCT_NOT_FOUND');
    }

    if (!product.is_active) {
      throw new BusinessRuleError(
        'Loan product is already deactivated',
        'ALREADY_DEACTIVATED',
      );
    }

    // Check for active loans
    const hasActiveLoans = await this.loanProductRepository.hasActiveLoans(id);
    if (hasActiveLoans) {
      throw new BusinessRuleError(
        'Cannot deactivate a loan product with active loans',
        'ACTIVE_LOANS_EXIST',
      );
    }

    const deactivated = await this.loanProductRepository.deactivate(id);

    await this.loanProductRepository.createAuditLog({
      action_type: 'loan_product_deactivated',
      actor_id: actorId,
      actor_role: actorRole,
      target_entity: 'loan_product',
      target_id: id,
      before_state: { is_active: true },
      after_state: { is_active: false },
      remarks: 'Product deactivated',
    });

    return deactivated;
  }

  /**
   * Validates that the annual rate is within system-configured bounds.
   * Reads max_annual_rate_bps and min_annual_rate_bps from the settings table.
   */
  async validateRateBounds(annualRateBps: number): Promise<void> {
    const [maxRateSetting, minRateSetting] = await Promise.all([
      this.loanProductRepository.getSetting('max_annual_rate_bps'),
      this.loanProductRepository.getSetting('min_annual_rate_bps'),
    ]);

    const maxRate = this.coerceRateSetting('max_annual_rate_bps', maxRateSetting);
    const minRate = this.coerceRateSetting('min_annual_rate_bps', minRateSetting);

    if (minRate !== null && annualRateBps < minRate) {
      throw new ValidationError(
        `Annual rate ${annualRateBps} bps is below the minimum allowed rate of ${minRate} bps`,
        'RATE_BELOW_MINIMUM',
      );
    }

    if (maxRate !== null && annualRateBps > maxRate) {
      throw new ValidationError(
        `Annual rate ${annualRateBps} bps exceeds the maximum allowed rate of ${maxRate} bps`,
        'RATE_EXCEEDS_MAXIMUM',
      );
    }
  }

  /**
   * Coerce a settings.value JSON payload to a finite number; throws on malformed
   * configured rows so a misconfigured cap can never silently no-op the safety check.
   */
  private coerceRateSetting(key: string, raw: unknown): number | null {
    if (raw === null || raw === undefined) return null;

    let candidate: unknown = raw;
    if (typeof candidate === 'object') {
      const obj = candidate as Record<string, unknown>;
      candidate = obj['value'] ?? obj['amount'] ?? obj['bps'];
    }

    if (typeof candidate === 'string' && candidate.trim() !== '') {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed)) candidate = parsed;
    }

    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }

    this.logger.warn(
      `Setting "${key}" is present but not a usable number (got ${JSON.stringify(raw)}); rejecting to avoid silent no-op of rate cap.`,
    );
    throw new BusinessRuleError(
      `System setting "${key}" is misconfigured and cannot be used to validate loan rate`,
      'INVALID_RATE_SETTING',
    );
  }

  /**
   * Validates that the allocation order contains exactly the three required components.
   */
  private validateAllocationOrder(order: string[]): void {
    if (order.length !== VALID_ALLOCATION_COMPONENTS.length) {
      throw new ValidationError(
        `Allocation order must contain exactly ${VALID_ALLOCATION_COMPONENTS.length} components: ${VALID_ALLOCATION_COMPONENTS.join(', ')}`,
        'INVALID_ALLOCATION_ORDER',
      );
    }

    const sorted = [...order].sort();
    const expectedSorted = [...VALID_ALLOCATION_COMPONENTS].sort();
    if (sorted.join(',') !== expectedSorted.join(',')) {
      throw new ValidationError(
        `Allocation order must contain exactly: ${VALID_ALLOCATION_COMPONENTS.join(', ')}`,
        'INVALID_ALLOCATION_ORDER',
      );
    }
  }
}
