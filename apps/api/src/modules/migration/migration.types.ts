/**
 * Types shared across the Migration module.
 */

export type MigrationDomain = 'customers' | 'groups' | 'group_members' | 'loans' | 'collections';

export type CustomerRow = {
  legacy_customer_id: string;
  full_name: string;
  father_or_husband_name?: string;
  mobile: string;
  alternate_mobile?: string;
  aadhaar: string;
  pan?: string;
  dob?: string;
  gender: string;
  occupation?: string;
  monthly_income_paise?: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  status?: string;
  assigned_officer_username?: string;
  registered_at?: string;
};

export type GroupRow = {
  legacy_group_id: string;
  name: string;
  leader_legacy_customer_id: string;
  meeting_day: string;
  branch_area: string;
  status?: string;
};

export type GroupMemberRow = {
  legacy_group_id: string;
  member_legacy_customer_id: string;
  joined_at?: string;
};

export type LoanRow = {
  legacy_loan_id: string;
  customer_legacy_customer_id: string;
  group_legacy_id?: string;
  principal_paise: string;
  total_interest_paise: string;
  total_payable_paise: string;
  tenure_months: string;
  installments_paid_count?: string;
  emi_paise: string;
  purpose: string;
  status: string;
  cached_outstanding_paise: string;
  disbursement_date: string;
  first_due_date: string;
};

export type CollectionRow = {
  legacy_collection_id: string;
  loan_legacy_loan_id: string;
  amount_paise: string;
  payment_date: string;
  payment_mode: string;
};

export type RowError = {
  domain: MigrationDomain;
  rowIndex: number;
  column: string;
  message: string;
};

export type DryRunResult = {
  draftId: string;
  fileHashes: Record<MigrationDomain, string>;
  totals: Record<MigrationDomain, number>;
  validCount: Record<MigrationDomain, number>;
  errors: RowError[];
  // Lookup maps built during validation — reused on commit.
  // (Only the counts and errors are returned to the client; full maps stay server-side.)
};

export type CommitResult = {
  draftId: string;
  rowsCommitted: Record<MigrationDomain, number>;
  migrationAuditId: string;
  durationMs: number;
};

export type MigrationState = 'available' | 'in-progress' | 'completed';

export const MIGRATION_STATE_KEY = 'migration_state';
export const MIGRATION_STATE_META_KEY = 'migration_state_meta';
export const MIGRATION_DRAFT_TTL_MS = 30 * 60 * 1000; // 30 min — longer than imports
