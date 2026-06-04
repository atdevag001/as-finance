import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

const PRODUCT_SELECT = {
  id: true,
  name: true,
  is_active: true,
  current_version_id: true,
  created_by: true,
  created_at: true,
  updated_at: true,
};

const VERSION_SELECT = {
  id: true,
  product_id: true,
  version_number: true,
  interest_type: true,
  annual_rate_bps: true,
  min_principal_paise: true,
  max_principal_paise: true,
  min_tenure_months: true,
  max_tenure_months: true,
  repayment_frequency: true,
  processing_fee_type: true,
  processing_fee_value: true,
  penalty_grace_days: true,
  penalty_type: true,
  penalty_value: true,
  penalty_frequency: true,
  max_concurrent_loans: true,
  allocation_order: true,
  is_active: true,
  created_at: true,
};

export interface CreateProductVersionData {
  product_id: string;
  version_number: number;
  interest_type: string;
  annual_rate_bps: number;
  min_principal_paise: bigint | number;
  max_principal_paise: bigint | number;
  min_tenure_months: number;
  max_tenure_months: number;
  repayment_frequency: string;
  processing_fee_type?: string | null;
  processing_fee_value?: number | null;
  penalty_grace_days: number;
  penalty_type?: string | null;
  penalty_value?: number | null;
  penalty_frequency?: string | null;
  max_concurrent_loans: number;
  allocation_order: string[];
}

@Injectable()
export class LoanProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByName(name: string) {
    return this.prisma['loan_products'].findUnique({
      where: { name },
      select: PRODUCT_SELECT,
    });
  }

  async findById(id: string) {
    return this.prisma['loan_products'].findUnique({
      where: { id },
      select: {
        ...PRODUCT_SELECT,
        current_version: { select: VERSION_SELECT },
        versions: {
          select: VERSION_SELECT,
          orderBy: { version_number: 'desc' as const },
        },
      },
    });
  }

  async findAll(params: { skip?: number; take?: number; isActive?: boolean }) {
    const where: Record<string, unknown> = {};
    if (params.isActive !== undefined) {
      where['is_active'] = params.isActive;
    }

    const [data, total] = await Promise.all([
      this.prisma['loan_products'].findMany({
        where,
        skip: params.skip ?? 0,
        take: params.take ?? 50,
        orderBy: { created_at: 'desc' as const },
        select: {
          ...PRODUCT_SELECT,
          current_version: { select: VERSION_SELECT },
        },
      }),
      this.prisma['loan_products'].count({ where }),
    ]);

    return { data, total };
  }

  /**
   * Creates a loan product and its first version atomically.
   * Returns the product with its current version.
   */
  async createWithVersion(
    productData: { name: string; created_by: string },
    versionData: Omit<CreateProductVersionData, 'product_id' | 'version_number'>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create the product (without current_version_id yet)
      const product = await tx.loan_products.create({
        data: {
          name: productData.name,
          created_by: productData.created_by,
        },
        select: PRODUCT_SELECT,
      });

      // 2. Create the first version
      const version = await tx.loan_product_versions.create({
        data: {
          product_id: product.id,
          version_number: 1,
          ...versionData,
        } as never,
        select: VERSION_SELECT,
      });

      // 3. Update product to point to the current version
      const updatedProduct = await tx.loan_products.update({
        where: { id: product.id },
        data: { current_version_id: version.id },
        select: {
          ...PRODUCT_SELECT,
          current_version: { select: VERSION_SELECT },
        },
      });

      return updatedProduct;
    });
  }

  /**
   * Creates a new version for an existing product and updates current_version_id.
   */
  async createNewVersion(
    productId: string,
    versionData: Omit<CreateProductVersionData, 'product_id'>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // 1. Create the new version
      const version = await tx.loan_product_versions.create({
        data: {
          product_id: productId,
          version_number: versionData.version_number,
          interest_type: versionData.interest_type,
          annual_rate_bps: versionData.annual_rate_bps,
          min_principal_paise: versionData.min_principal_paise,
          max_principal_paise: versionData.max_principal_paise,
          min_tenure_months: versionData.min_tenure_months,
          max_tenure_months: versionData.max_tenure_months,
          repayment_frequency: versionData.repayment_frequency,
          processing_fee_type: versionData.processing_fee_type,
          processing_fee_value: versionData.processing_fee_value,
          penalty_grace_days: versionData.penalty_grace_days,
          penalty_type: versionData.penalty_type,
          penalty_value: versionData.penalty_value,
          penalty_frequency: versionData.penalty_frequency,
          max_concurrent_loans: versionData.max_concurrent_loans,
          allocation_order: versionData.allocation_order,
        } as never,
        select: VERSION_SELECT,
      });

      // 2. Update product to point to the new version
      const updatedProduct = await tx.loan_products.update({
        where: { id: productId },
        data: { current_version_id: version.id },
        select: {
          ...PRODUCT_SELECT,
          current_version: { select: VERSION_SELECT },
          versions: {
            select: VERSION_SELECT,
            orderBy: { version_number: 'desc' as const },
          },
        },
      });

      return updatedProduct;
    });
  }

  /**
   * Get the latest version number for a product.
   */
  async getLatestVersionNumber(productId: string): Promise<number> {
    const latest = await this.prisma['loan_product_versions'].findFirst({
      where: { product_id: productId },
      orderBy: { version_number: 'desc' as const },
      select: { version_number: true },
    });
    return latest?.version_number ?? 0;
  }

  /**
   * Check if a product has active loans (status in: active, overdue, disbursed).
   */
  async hasActiveLoans(productId: string): Promise<boolean> {
    const count = await this.prisma['loans'].count({
      where: {
        product_version: { product_id: productId },
        status: { in: ['active', 'overdue', 'disbursed'] },
      },
    });
    return count > 0;
  }

  async deactivate(id: string) {
    return this.prisma['loan_products'].update({
      where: { id },
      data: { is_active: false },
      select: {
        ...PRODUCT_SELECT,
        current_version: { select: VERSION_SELECT },
      },
    });
  }

  async getSetting(key: string): Promise<unknown | null> {
    const setting = await this.prisma['settings'].findUnique({
      where: { key },
      select: { value: true },
    });
    return setting?.value ?? null;
  }

  async createAuditLog(data: {
    action_type: string;
    actor_id: string;
    actor_role: string;
    target_entity: string;
    target_id: string;
    before_state?: unknown;
    after_state?: unknown;
    remarks?: string;
    ip_address?: string;
    request_id?: string;
  }) {
    return this.prisma['audit_logs'].create({
      data: {
        ...data,
        ip_address: data.ip_address ?? '0.0.0.0',
        request_id: data.request_id ?? '00000000-0000-0000-0000-000000000000',
      } as never,
    });
  }
}
