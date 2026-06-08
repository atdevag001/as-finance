import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { LoanProductService } from '../../loan-product/loan-product.service';
import type { DomainImporter, ImportDomain } from '../types';

type LoanProductRow = {
  name: string;
  interestType: string;
  annualRateBps: number;
  minPrincipalPaise: number;
  maxPrincipalPaise: number;
  minTenureMonths: number;
  maxTenureMonths: number;
  repaymentFrequency: string;
};

/**
 * Loan Product importer — creates new products via the existing
 * LoanProductService.create() API, which handles versioning + audit logging.
 *
 * Imports do NOT touch existing products with the same name (to avoid
 * silently changing rates on in-flight loans). Conflicts surface as a row
 * error.
 */
@Injectable()
export class LoanProductImporter implements DomainImporter<LoanProductRow> {
  readonly domain: ImportDomain = 'loan-products';
  readonly displayLabel = 'Loan Product';
  readonly permission = 'loan_product.import' as const;

  readonly schema = [
    { key: 'name', type: 'string' as const, required: true },
    {
      key: 'interestType',
      type: 'string' as const,
      required: true,
      validate: (v: unknown) =>
        v === 'flat' || v === 'reducing_balance' ? null : "Must be 'flat' or 'reducing_balance'",
    },
    { key: 'annualRateBps', type: 'number' as const, required: true },
    { key: 'minPrincipalPaise', type: 'number' as const, required: true },
    { key: 'maxPrincipalPaise', type: 'number' as const, required: true },
    { key: 'minTenureMonths', type: 'number' as const, required: true },
    { key: 'maxTenureMonths', type: 'number' as const, required: true },
    {
      key: 'repaymentFrequency',
      type: 'string' as const,
      required: true,
      validate: (v: unknown) =>
        v === 'daily' || v === 'weekly' || v === 'monthly'
          ? null
          : "Must be 'daily', 'weekly', or 'monthly'",
    },
  ];

  readonly templateColumns = [
    { key: 'name', label: 'Name', example: 'Group Loan 24% / 12mo' },
    { key: 'interestType', label: 'Interest Type', example: 'reducing_balance' },
    { key: 'annualRateBps', label: 'Annual Rate (bps)', example: '2400' },
    { key: 'minPrincipalPaise', label: 'Min Principal (paise)', example: '500000' },
    { key: 'maxPrincipalPaise', label: 'Max Principal (paise)', example: '5000000' },
    { key: 'minTenureMonths', label: 'Min Tenure (months)', example: '3' },
    { key: 'maxTenureMonths', label: 'Max Tenure (months)', example: '24' },
    { key: 'repaymentFrequency', label: 'Frequency', example: 'monthly' },
  ];

  constructor(
    @Inject(LoanProductService) private readonly products: LoanProductService,
  ) {}

  async applyRow(row: LoanProductRow, _tx: unknown, actorId: string): Promise<void> {
    if (row.minPrincipalPaise > row.maxPrincipalPaise) {
      throw new BadRequestException(
        `${row.name}: Min principal cannot exceed max principal`,
      );
    }
    if (row.minTenureMonths > row.maxTenureMonths) {
      throw new BadRequestException(`${row.name}: Min tenure cannot exceed max tenure`);
    }

    await this.products.create(
      {
        name: row.name,
        interestType: row.interestType as 'flat' | 'reducing_balance',
        annualRateBps: Math.round(row.annualRateBps),
        minPrincipalPaise: Math.round(row.minPrincipalPaise),
        maxPrincipalPaise: Math.round(row.maxPrincipalPaise),
        minTenureMonths: Math.round(row.minTenureMonths),
        maxTenureMonths: Math.round(row.maxTenureMonths),
        repaymentFrequency: row.repaymentFrequency as 'daily' | 'weekly' | 'monthly',
      },
      actorId,
      'super_admin',
    );
  }
}
