import { AccountCategory } from '@as-finance/shared';

export interface FixtureAccount {
  code: string;
  name: string;
  category: AccountCategory;
}

/**
 * Sample chart of accounts matching the seed data from the design document.
 */
export const SAMPLE_CHART_OF_ACCOUNTS: FixtureAccount[] = [
  { code: '1001', name: 'Cash', category: AccountCategory.ASSET },
  { code: '1002', name: 'Bank', category: AccountCategory.ASSET },
  { code: '1100', name: 'Loans Receivable', category: AccountCategory.ASSET },
  { code: '4001', name: 'Interest Income', category: AccountCategory.INCOME },
  { code: '4002', name: 'Processing Fee Income', category: AccountCategory.INCOME },
  { code: '4003', name: 'Penalty Income', category: AccountCategory.INCOME },
  { code: '4004', name: 'Other Income', category: AccountCategory.INCOME },
  { code: '5001', name: 'Salary Expense', category: AccountCategory.EXPENSE },
  { code: '5002', name: 'Rent Expense', category: AccountCategory.EXPENSE },
  { code: '5003', name: 'Travel Expense', category: AccountCategory.EXPENSE },
  { code: '5004', name: 'Office Expense', category: AccountCategory.EXPENSE },
  { code: '5099', name: 'Other Expense', category: AccountCategory.EXPENSE },
  { code: '3001', name: "Owner's Equity", category: AccountCategory.EQUITY },
];
