export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  MANAGER = 'manager',
  FIELD_OFFICER = 'field_officer',
  COLLECTION_OFFICER = 'collection_officer',
  ACCOUNTANT = 'accountant',
  OFFICE_STAFF = 'office_staff',
  VIEWER_AUDITOR = 'viewer_auditor',
}

export enum LoanStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  DISBURSED = 'disbursed',
  ACTIVE = 'active',
  OVERDUE = 'overdue',
  DEFAULTED = 'defaulted',
  FORECLOSED = 'foreclosed',
  CLOSED = 'closed',
}

export enum CustomerStatus {
  ACTIVE = 'active',
  BLACKLISTED = 'blacklisted',
  INACTIVE = 'inactive',
}

export enum InterestType {
  FLAT = 'flat',
  REDUCING_BALANCE = 'reducing_balance',
}

export enum Frequency {
  DAILY = 'daily',
  WEEKLY = 'weekly',
  MONTHLY = 'monthly',
}

export enum PaymentMode {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  ONLINE = 'online',
}

export enum CollectionStatus {
  POSTED = 'posted',
  REVERSED = 'reversed',
}

export enum ReceiptStatus {
  ACTIVE = 'active',
  REVERSED = 'reversed',
}

export enum InstallmentStatus {
  PENDING = 'pending',
  PARTIAL = 'partial',
  PAID = 'paid',
  OVERDUE = 'overdue',
  CLOSED = 'closed',
}

export enum OverdueBucket {
  BUCKET_0 = 'bucket_0',
  BUCKET_1_30 = 'bucket_1_30',
  BUCKET_31_60 = 'bucket_31_60',
  BUCKET_61_90 = 'bucket_61_90',
  BUCKET_90_PLUS = 'bucket_90_plus',
}

export enum GroupStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISSOLVED = 'dissolved',
}

export enum AccountCategory {
  ASSET = 'asset',
  LIABILITY = 'liability',
  INCOME = 'income',
  EXPENSE = 'expense',
  EQUITY = 'equity',
}

export enum JournalSourceType {
  DISBURSEMENT = 'disbursement',
  COLLECTION = 'collection',
  REVERSAL = 'reversal',
  PENALTY = 'penalty',
  EXPENSE = 'expense',
  PROCESSING_FEE = 'processing_fee',
  FORECLOSURE = 'foreclosure',
}

export enum NotificationEvent {
  LOAN_APPROVED = 'loan_approved',
  LOAN_REJECTED = 'loan_rejected',
  DISBURSED = 'disbursed',
  COLLECTION_RECEIPT = 'collection_receipt',
  EMI_REMINDER = 'emi_reminder',
  OVERDUE_REMINDER = 'overdue_reminder',
  PENALTY_NOTICE = 'penalty_notice',
  DAILY_COLLECTION_SUMMARY = 'daily_collection_summary',
}

export enum OutboxStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SENT = 'sent',
  FAILED = 'failed',
  DEAD_LETTER = 'dead_letter',
}

export enum AuditAction {
  CUSTOMER_CREATED = 'customer_created',
  CUSTOMER_UPDATED = 'customer_updated',
  CUSTOMER_BLACKLISTED = 'customer_blacklisted',
  CUSTOMER_REINSTATED = 'customer_reinstated',
  LOAN_CREATED = 'loan_created',
  LOAN_SUBMITTED = 'loan_submitted',
  LOAN_REVIEWED = 'loan_reviewed',
  LOAN_APPROVED = 'loan_approved',
  LOAN_REJECTED = 'loan_rejected',
  LOAN_DISBURSED = 'loan_disbursed',
  LOAN_CLOSED = 'loan_closed',
  LOAN_FORECLOSED = 'loan_foreclosed',
  LOAN_OVERDUE = 'loan_overdue',
  LOAN_DEFAULTED = 'loan_defaulted',
  COLLECTION_POSTED = 'collection_posted',
  COLLECTION_REVERSED = 'collection_reversed',
  PENALTY_POSTED = 'penalty_posted',
  PENALTY_WAIVED = 'penalty_waived',
  EXPENSE_RECORDED = 'expense_recorded',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  ACCOUNT_LOCKED = 'account_locked',
  PASSWORD_CHANGED = 'password_changed',
  USER_CREATED = 'user_created',
  USER_ROLE_CHANGED = 'user_role_changed',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  CASH_HANDOVER = 'cash_handover',
  DOCUMENT_UPLOADED = 'document_uploaded',
  DOCUMENT_DELETED = 'document_deleted',
}
