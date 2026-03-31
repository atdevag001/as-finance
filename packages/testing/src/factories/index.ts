// Factory helpers
export { buildEntity, randomPaise, randomInt, randomAadhaar, randomPan, randomMobile, randomPincode, randomUUID } from './helpers.js';

// Entity factories (create* naming — existing)
export { createUser, type TestUser } from './user.factory.js';
export { createCustomer, type TestCustomer } from './customer.factory.js';
export { createLoanProduct, type TestLoanProduct, type TestLoanProductVersion } from './loan-product.factory.js';
export { createLoan, type TestLoan } from './loan.factory.js';
export { createCollection, type TestCollection } from './collection.factory.js';
export { createInstallment, type TestInstallment } from './installment.factory.js';
export { createGroup, type TestGroup } from './group.factory.js';
export { createJournalEntry, type TestJournalEntry, type TestJournalLine } from './journal-entry.factory.js';

// build* factories — used by unit and property-based tests
export { buildScheduleParams, type ScheduleParams } from './schedule-params.factory.js';
export { buildInstallmentState, buildPenaltyState, type InstallmentState, type PenaltyState } from './allocation-params.factory.js';
export { buildCollectionInput, type CollectionInput } from './collection-input.factory.js';
export { buildReceiptData, type ReceiptData } from './receipt-data.factory.js';
export { buildDailySummaryInput, type DailySummaryInput } from './daily-summary.factory.js';
export { buildAuditLogEntry, type AuditLogEntry } from './audit-log.factory.js';
export { buildIdempotencyRecord, type IdempotencyRecord } from './idempotency.factory.js';
export { buildSmsTemplate, type SmsTemplate } from './sms-template.factory.js';
export {
  buildUser,
  buildCustomer,
  buildLoan,
  buildLoanProduct,
  buildJournalEntry,
  buildJournalLine,
  type JournalEntry,
  type JournalLine,
} from './build-aliases.factory.js';
