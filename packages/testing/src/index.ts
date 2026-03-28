// Factories
export {
  buildEntity,
  randomPaise,
  randomInt,
  randomAadhaar,
  randomPan,
  randomMobile,
  randomPincode,
  createUser,
  createCustomer,
  createLoanProduct,
  createLoan,
  createCollection,
  createInstallment,
  createGroup,
  createJournalEntry,
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
} from './factories/index.js';

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
