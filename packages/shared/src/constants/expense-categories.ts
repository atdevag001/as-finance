/**
 * Whitelist of expense categories accepted by the cashbook expense API.
 * Shared with the frontend dropdown so unknown values fail validation
 * instead of silently bucketing to "Other Expense" (5099) and polluting analytics.
 */
export const EXPENSE_CATEGORIES = [
  'salary',
  'rent',
  'travel',
  'office',
  'office_supplies',
  'utilities',
  'maintenance',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
