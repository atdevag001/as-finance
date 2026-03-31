// Money arbitraries
export { paiseArb, bigPaiseArb, annualRateBpsArb, tenureMonthsArb } from './money.arbitrary.js';

// Schedule arbitraries
export { scheduleParamsArb } from './schedule.arbitrary.js';

// Allocation arbitraries
export { installmentStateArb, allocationParamsArb } from './allocation.arbitrary.js';

// Journal/accounting arbitraries
export { journalEntryArb, journalLineArb } from './journal.arbitrary.js';

// Penalty arbitraries
export { penaltyConfigArb, dueDateArb, type PenaltyConfig } from './penalty.arbitrary.js';

// Receipt arbitraries
export { receiptDataArb } from './receipt.arbitrary.js';

// Cashbook arbitraries
export { dailySummaryInputArb } from './cashbook.arbitrary.js';

// RBAC arbitraries
export { roleArb, permissionKeyArb } from './rbac.arbitrary.js';

// Idempotency arbitraries
export { idempotencyKeyArb, operationTypeArb } from './idempotency.arbitrary.js';

// Template arbitraries
export { templateArb, variableMapArb } from './template.arbitrary.js';
