import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { LoanService } from '../loan.service';
import { BusinessRuleError } from '../../../common/errors';

// Instantiate LoanService with null repository — validateTransition is pure
const loanService = new LoanService(null as any);

// Get the allowed transitions map from the service
const allowedTransitions = loanService.getAllowedTransitions();

// All known statuses
const ALL_STATUSES = Object.keys(allowedTransitions);

// Terminal states — those with empty allowed transition lists
const TERMINAL_STATES = ALL_STATUSES.filter(
  (s) => allowedTransitions[s]!.length === 0,
);

// ─── Generators ─────────────────────────────────────────────────────────────

/** Arbitrary valid status */
const statusArb = fc.constantFrom(...ALL_STATUSES);

/**
 * Arbitrary valid (fromStatus, toStatus) pair where the transition IS allowed.
 * We build the list of all valid pairs and pick from them.
 */
const validTransitionPairs: [string, string][] = [];
for (const from of ALL_STATUSES) {
  for (const to of allowedTransitions[from]!) {
    validTransitionPairs.push([from, to]);
  }
}
const validTransitionArb = fc.constantFrom(...validTransitionPairs);

/**
 * Arbitrary invalid (fromStatus, toStatus) pair where the transition is NOT allowed.
 */
const invalidTransitionPairs: [string, string][] = [];
for (const from of ALL_STATUSES) {
  const allowed = new Set(allowedTransitions[from]!);
  for (const to of ALL_STATUSES) {
    if (!allowed.has(to)) {
      invalidTransitionPairs.push([from, to]);
    }
  }
}
const invalidTransitionArb = fc.constantFrom(...invalidTransitionPairs);


// ─── Property 21: Loan State Machine Validity ───────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 21: Loan State Machine Validity
 *
 * For all loan status transition attempts, only transitions defined in the allowed
 * transition matrix SHALL succeed. Any transition not in the matrix SHALL be rejected
 * with a typed error indicating the current status and allowed transitions. Terminal
 * states (closed, foreclosed, defaulted, rejected) SHALL have no outgoing transitions.
 *
 * **Validates: Requirements 3.1, 3.9**
 */
describe('Property 21: Loan State Machine Validity', () => {
  it('valid transitions do NOT throw', () => {
    fc.assert(
      fc.property(validTransitionArb, ([fromStatus, toStatus]) => {
        // Should not throw for any allowed transition
        expect(() => loanService.validateTransition(fromStatus, toStatus)).not.toThrow();
      }),
      { numRuns: 100 },
    );
  });

  it('invalid transitions throw BusinessRuleError with INVALID_STATUS_TRANSITION code', () => {
    fc.assert(
      fc.property(invalidTransitionArb, ([fromStatus, toStatus]) => {
        try {
          loanService.validateTransition(fromStatus, toStatus);
          // Should never reach here
          expect.unreachable('Expected BusinessRuleError to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(BusinessRuleError);
          expect((err as BusinessRuleError).code).toBe('INVALID_STATUS_TRANSITION');
        }
      }),
      { numRuns: 200 },
    );
  });

  it('terminal states (rejected, defaulted, foreclosed, closed) have no outgoing transitions', () => {
    const expectedTerminals = ['rejected', 'defaulted', 'foreclosed', 'closed'];

    // Verify all expected terminal states are recognized
    for (const terminal of expectedTerminals) {
      expect(TERMINAL_STATES).toContain(terminal);
    }

    // Property: for all terminal states and all possible target statuses,
    // the transition is always rejected
    fc.assert(
      fc.property(
        fc.constantFrom(...expectedTerminals),
        statusArb,
        (terminalStatus, targetStatus) => {
          try {
            loanService.validateTransition(terminalStatus, targetStatus);
            expect.unreachable(
              `Expected transition from terminal state '${terminalStatus}' to '${targetStatus}' to throw`,
            );
          } catch (err) {
            expect(err).toBeInstanceOf(BusinessRuleError);
            expect((err as BusinessRuleError).code).toBe('INVALID_STATUS_TRANSITION');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 22: Maker-Checker Enforcement ─────────────────────────────────

/**
 * Feature: as-finance-loan-management-system, Property 22: Maker-Checker Enforcement
 *
 * For all loan approvals, the approving user SHALL differ from the loan creator.
 * Any attempt where maker == checker SHALL be rejected with MAKER_CHECKER_VIOLATION.
 * When approver ≠ creator, the maker-checker check itself SHALL pass (approval may
 * still fail for other reasons, but not due to maker-checker).
 *
 * **Validates: Requirements 3.7, 9.6**
 */
describe('Property 22: Maker-Checker Enforcement', () => {
  /** Arbitrary non-empty user ID string */
  const userIdArb = fc.stringMatching(/^[a-f0-9-]{8,36}$/);

  /**
   * Build a LoanService with a mocked repository that returns a loan
   * in under_review status with the given created_by.
   */
  function buildServiceWithLoan(createdBy: string) {
    const mockRepo = {
      findById: async () => ({
        id: 'loan-1',
        status: 'under_review',
        created_by: createdBy,
      }),
      updateStatus: async () => ({ id: 'loan-1', status: 'approved' }),
      createStatusHistory: async () => ({}),
      createApproval: async () => ({}),
      createAuditLog: async () => ({}),
    };
    return new LoanService(mockRepo as any);
  }

  it('maker === checker is always rejected with MAKER_CHECKER_VIOLATION', async () => {
    await fc.assert(
      fc.asyncProperty(userIdArb, async (userId) => {
        const service = buildServiceWithLoan(userId);
        try {
          await service.approve('loan-1', { remarks: 'ok' } as any, userId, 'manager');
          expect.unreachable('Expected MAKER_CHECKER_VIOLATION to be thrown');
        } catch (err) {
          expect(err).toBeInstanceOf(BusinessRuleError);
          expect((err as BusinessRuleError).code).toBe('MAKER_CHECKER_VIOLATION');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('maker !== checker passes the maker-checker check (no MAKER_CHECKER_VIOLATION)', async () => {
    await fc.assert(
      fc.asyncProperty(
        userIdArb,
        userIdArb,
        async (creatorId, approverId) => {
          fc.pre(creatorId !== approverId);
          const service = buildServiceWithLoan(creatorId);
          try {
            await service.approve('loan-1', { remarks: 'ok' } as any, approverId, 'manager');
            // Approval succeeded — maker-checker passed
          } catch (err) {
            // If it throws, it must NOT be a maker-checker violation
            if (err instanceof BusinessRuleError) {
              expect((err as BusinessRuleError).code).not.toBe('MAKER_CHECKER_VIOLATION');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
