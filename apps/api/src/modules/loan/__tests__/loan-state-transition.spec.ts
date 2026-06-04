import { describe, it, expect } from 'vitest';
import { LoanService } from '../loan.service';
import { BusinessRuleError } from '../../../common/errors';

/**
 * Unit tests for loan state transition validation (Task 3.8).
 *
 * Tests the `validateTransition()` method which enforces the loan
 * lifecycle state machine. The method is pure (no DB access needed).
 *
 * Validates: Requirements 15.1, 15.2, 15.8
 */

// Instantiate with null repository — validateTransition is a pure function
const loanService = new LoanService(null as any);

// ─── Requirement 15.1: All valid transitions succeed ────────────────────────

describe('validateTransition — valid transitions', () => {
  const validTransitions: [string, string][] = [
    ['draft', 'submitted'],
    ['submitted', 'under_review'],
    ['under_review', 'approved'],
    ['under_review', 'rejected'],
    ['approved', 'disbursed'],
    ['disbursed', 'active'],
    ['active', 'overdue'],
    ['active', 'closed'],
    ['active', 'foreclosed'],
    ['active', 'defaulted'],
    ['overdue', 'active'],
    ['overdue', 'closed'],
    ['overdue', 'foreclosed'],
    ['overdue', 'defaulted'],
  ];

  it.each(validTransitions)(
    '%s → %s does not throw',
    (from, to) => {
      expect(() => { loanService.validateTransition(from, to); }).not.toThrow();
    },
  );
});

// ─── Requirement 15.2: All invalid transitions are rejected ─────────────────

describe('validateTransition — invalid transitions', () => {
  const invalidTransitions: [string, string][] = [
    // draft can only go to submitted
    ['draft', 'approved'],
    ['draft', 'active'],
    ['draft', 'under_review'],
    ['draft', 'disbursed'],
    ['draft', 'closed'],
    // submitted can only go to under_review
    ['submitted', 'approved'],
    ['submitted', 'draft'],
    ['submitted', 'active'],
    // under_review can only go to approved or rejected
    ['under_review', 'draft'],
    ['under_review', 'active'],
    ['under_review', 'disbursed'],
    // approved can only go to disbursed
    ['approved', 'active'],
    ['approved', 'closed'],
    ['approved', 'draft'],
    // disbursed can only go to active
    ['disbursed', 'closed'],
    ['disbursed', 'overdue'],
    ['disbursed', 'draft'],
    // closed → anything
    ['closed', 'active'],
    ['closed', 'draft'],
    ['closed', 'overdue'],
    // rejected → anything
    ['rejected', 'submitted'],
    ['rejected', 'draft'],
    ['rejected', 'active'],
  ];

  it.each(invalidTransitions)(
    '%s → %s throws BusinessRuleError with INVALID_STATUS_TRANSITION',
    (from, to) => {
      expect(() => { loanService.validateTransition(from, to); }).toThrow(BusinessRuleError);
      try {
        loanService.validateTransition(from, to);
      } catch (err) {
        expect((err as BusinessRuleError).code).toBe('INVALID_STATUS_TRANSITION');
      }
    },
  );

  it('unknown source status throws BusinessRuleError with INVALID_LOAN_STATUS', () => {
    expect(() => { loanService.validateTransition('nonexistent', 'active'); }).toThrow(
      BusinessRuleError,
    );
    try {
      loanService.validateTransition('nonexistent', 'active');
    } catch (err) {
      expect((err as BusinessRuleError).code).toBe('INVALID_LOAN_STATUS');
    }
  });
});

// ─── Requirement 15.8: Terminal states have no outgoing transitions ─────────

describe('validateTransition — terminal states', () => {
  const terminalStates = ['rejected', 'defaulted', 'foreclosed', 'closed'];
  const allStatuses = [
    'draft', 'submitted', 'under_review', 'approved', 'rejected',
    'disbursed', 'active', 'overdue', 'defaulted', 'foreclosed', 'closed',
  ];

  for (const terminal of terminalStates) {
    describe(`${terminal} (terminal)`, () => {
      it.each(allStatuses)(
        `${terminal} → %s throws BusinessRuleError`,
        (target) => {
          expect(() => { loanService.validateTransition(terminal, target); }).toThrow(
            BusinessRuleError,
          );
          try {
            loanService.validateTransition(terminal, target);
          } catch (err) {
            expect((err as BusinessRuleError).code).toBe('INVALID_STATUS_TRANSITION');
          }
        },
      );
    });
  }

  it('getAllowedTransitions() returns empty arrays for all terminal states', () => {
    const transitions = loanService.getAllowedTransitions();
    for (const terminal of terminalStates) {
      expect(transitions[terminal]).toEqual([]);
    }
  });
});
