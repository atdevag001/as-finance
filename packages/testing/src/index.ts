// Factories
export {
  // Helpers
  buildEntity,
  randomPaise,
  randomInt,
  randomAadhaar,
  randomPan,
  randomMobile,
  randomPincode,
  // create* factories (existing)
  createUser,
  createCustomer,
  createLoanProduct,
  createLoan,
  createCollection,
  createInstallment,
  createGroup,
  createJournalEntry,
  // build* factories (new)
  buildScheduleParams,
  buildInstallmentState,
  buildPenaltyState,
  buildCollectionInput,
  buildReceiptData,
  buildDailySummaryInput,
  buildAuditLogEntry,
  buildIdempotencyRecord,
  buildSmsTemplate,
  buildUser,
  buildCustomer,
  buildLoan,
  buildLoanProduct,
  buildJournalEntry,
  buildJournalLine,
  // Types (existing)
  type TestUser,
  type TestCustomer,
  type TestLoanProduct,
  type TestLoanProductVersion,
  type TestLoan,
  type TestCollection,
  type TestInstallment,
  type TestGroup,
  type TestJournalEntry,
  type TestJournalLine,
  // Types (new)
  type ScheduleParams,
  type InstallmentState,
  type PenaltyState,
  type CollectionInput,
  type ReceiptData,
  type DailySummaryInput,
  type AuditLogEntry,
  type IdempotencyRecord,
  type SmsTemplate,
  type JournalEntry,
  type JournalLine,
} from './factories/index.js';

// Arbitraries
export {
  paiseArb,
  bigPaiseArb,
  annualRateBpsArb,
  tenureMonthsArb,
  scheduleParamsArb,
  installmentStateArb,
  allocationParamsArb,
  journalEntryArb,
  journalLineArb,
  penaltyConfigArb,
  dueDateArb,
  receiptDataArb,
  dailySummaryInputArb,
  roleArb,
  permissionKeyArb,
  idempotencyKeyArb,
  operationTypeArb,
  templateArb,
  variableMapArb,
  type PenaltyConfig,
} from './arbitraries/index.js';

// Helpers
export {
  expectBalanced,
  expectNonNegativePaise,
  expectMonotonicallyIncreasing,
} from './helpers/index.js';

// Fixtures
export {
  SAMPLE_CHART_OF_ACCOUNTS,
  SAMPLE_USERS,
  FLAT_MONTHLY_PRODUCT,
  REDUCING_MONTHLY_PRODUCT,
  FLAT_WEEKLY_PRODUCT,
  REDUCING_DAILY_PRODUCT,
  type FixtureAccount,
} from './fixtures/index.js';
