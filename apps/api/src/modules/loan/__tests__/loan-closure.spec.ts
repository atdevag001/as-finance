import { describe, it, expect, beforeEach } from 'vitest';
import { LoanService } from '../loan.service';
import { BusinessRuleError, NotFoundError } from '../../../common/errors';

/**
 * Unit tests for loan closure logic (Task 21.1).
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4
 */

// ─── Mock Repository Builder ────────────────────────────────────────────────

interface MockOverrides {
  loanStatus?: string;
  loanExists?: boolean;
  unpaidInstallments?: { id: string; installment_number: number; status: string; principal_paise: bigint; interest_paise: bigint; principal_paid_paise: bigint; interest_paid_paise: bigint }[];
  unsettledPenalties?: { id: string; amount_paise: bigint; penalty_period: string; installment_id: string }[];
  pendingReversals?: { id: string; original_collection_id: string }[];
  outstandingBalance?: bigint | null;
}

function buildMockRepo(overrides: MockOverrides = {}) {
  const status = overrides.loanStatus ?? 'active';
  return {
    findById: async (id: string) => {
      if (!overrides.loanExists && overrides.loanExists !== undefined) return null;
      return {
        id,
        loan_number: 'LN-2024-00001',
        status,
        created_by: 'creator-1',
        customer_id: 'cust-1',
        principal_paise: 100000n,
      };
    },
    getUnpaidInstallments: async () => overrides.unpaidInstallments ?? [],
    getUnsettledPenalties: async () => overrides.unsettledPenalties ?? [],
    getPendingReversals: async () => overrides.pendingReversals ?? [],
    getOutstandingBalance: async () => overrides.outstandingBalance ?? 0n,
    updateStatus: async (_id: string, newStatus: string) => ({
      id: _id,
      status: newStatus,
    }),
    createStatusHistory: async () => ({}),
    createAuditLog: async () => ({}),
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LoanService.closeLoan', () => {
  describe('successful closure', () => {
    it('closes an active loan when all prerequisites are met', async () => {
      const repo = buildMockRepo({ loanStatus: 'active' });
      const service = new LoanService(repo as any);

      const result = await service.closeLoan('loan-1', 'actor-1', 'manager');

      expect(result!.status).toBe('closed');
    });

    it('closes an overdue loan when all prerequisites are met', async () => {
      const repo = buildMockRepo({ loanStatus: 'overdue' });
      const service = new LoanService(repo as any);

      const result = await service.closeLoan('loan-1', 'actor-1', 'manager');

      expect(result!.status).toBe('closed');
    });

    it('allows closure when outstanding balance is within 1 paisa tolerance', async () => {
      const repo = buildMockRepo({
        loanStatus: 'active',
        outstandingBalance: 1n,
      });
      const service = new LoanService(repo as any);

      const result = await service.closeLoan('loan-1', 'actor-1', 'manager');

      expect(result!.status).toBe('closed');
    });

    it('allows closure when outstanding balance is -1 paisa (rounding)', async () => {
      const repo = buildMockRepo({
        loanStatus: 'active',
        outstandingBalance: -1n,
      });
      const service = new LoanService(repo as any);

      const result = await service.closeLoan('loan-1', 'actor-1', 'manager');

      expect(result!.status).toBe('closed');
    });

    it('records status history on closure', async () => {
      let historyRecorded = false;
      const repo = buildMockRepo({ loanStatus: 'active' });
      (repo as any).createStatusHistory = async (data: any) => {
        expect(data.from_status).toBe('active');
        expect(data.to_status).toBe('closed');
        historyRecorded = true;
        return {};
      };
      const service = new LoanService(repo as any);

      await service.closeLoan('loan-1', 'actor-1', 'manager');

      expect(historyRecorded).toBe(true);
    });

    it('creates audit log on closure', async () => {
      let auditCreated = false;
      const repo = buildMockRepo({ loanStatus: 'active' });
      (repo as any).createAuditLog = async (data: any) => {
        expect(data.action_type).toBe('loan_closed');
        expect(data.target_entity).toBe('loan');
        expect(data.after_state.status).toBe('closed');
        auditCreated = true;
        return {};
      };
      const service = new LoanService(repo as any);

      await service.closeLoan('loan-1', 'actor-1', 'manager');

      expect(auditCreated).toBe(true);
    });
  });

  describe('prerequisite failures', () => {
    it('rejects closure when loan is not found', async () => {
      const repo = buildMockRepo({ loanExists: false });
      const service = new LoanService(repo as any);

      await expect(
        service.closeLoan('nonexistent', 'actor-1', 'manager'),
      ).rejects.toThrow(NotFoundError);
    });

    it('rejects closure from invalid status (draft)', async () => {
      const repo = buildMockRepo({ loanStatus: 'draft' });
      const service = new LoanService(repo as any);

      await expect(
        service.closeLoan('loan-1', 'actor-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects closure from terminal status (closed)', async () => {
      const repo = buildMockRepo({ loanStatus: 'closed' });
      const service = new LoanService(repo as any);

      await expect(
        service.closeLoan('loan-1', 'actor-1', 'manager'),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('rejects closure when installments are unpaid', async () => {
      const repo = buildMockRepo({
        loanStatus: 'active',
        unpaidInstallments: [
          {
            id: 'inst-1',
            installment_number: 3,
            status: 'pending',
            principal_paise: 10000n,
            interest_paise: 1000n,
            principal_paid_paise: 0n,
            interest_paid_paise: 0n,
          },
        ],
      });
      const service = new LoanService(repo as any);

      try {
        await service.closeLoan('loan-1', 'actor-1', 'manager');
        expect.unreachable('Expected BusinessRuleError');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessRuleError);
        expect((err as BusinessRuleError).code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
        expect((err as BusinessRuleError).message).toContain('Unpaid installments');
        expect((err as BusinessRuleError).message).toContain('#3');
      }
    });

    it('rejects closure when penalties are unsettled', async () => {
      const repo = buildMockRepo({
        loanStatus: 'active',
        unsettledPenalties: [
          {
            id: 'pen-1',
            amount_paise: 500n,
            penalty_period: '2024-01',
            installment_id: 'inst-1',
          },
        ],
      });
      const service = new LoanService(repo as any);

      try {
        await service.closeLoan('loan-1', 'actor-1', 'manager');
        expect.unreachable('Expected BusinessRuleError');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessRuleError);
        expect((err as BusinessRuleError).code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
        expect((err as BusinessRuleError).message).toContain('Unsettled penalties');
      }
    });

    it('rejects closure when there are pending reversals', async () => {
      const repo = buildMockRepo({
        loanStatus: 'active',
        pendingReversals: [
          { id: 'rev-1', original_collection_id: 'col-1' },
        ],
      });
      const service = new LoanService(repo as any);

      try {
        await service.closeLoan('loan-1', 'actor-1', 'manager');
        expect.unreachable('Expected BusinessRuleError');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessRuleError);
        expect((err as BusinessRuleError).code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
        expect((err as BusinessRuleError).message).toContain('Pending reversals');
      }
    });

    it('rejects closure when outstanding balance exceeds tolerance', async () => {
      const repo = buildMockRepo({
        loanStatus: 'active',
        outstandingBalance: 200n,
      });
      const service = new LoanService(repo as any);

      try {
        await service.closeLoan('loan-1', 'actor-1', 'manager');
        expect.unreachable('Expected BusinessRuleError');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessRuleError);
        expect((err as BusinessRuleError).code).toBe('CLOSURE_PREREQUISITES_NOT_MET');
        expect((err as BusinessRuleError).message).toContain('Outstanding balance');
      }
    });

    it('lists ALL unmet prerequisites in a single error', async () => {
      const repo = buildMockRepo({
        loanStatus: 'active',
        unpaidInstallments: [
          {
            id: 'inst-1',
            installment_number: 1,
            status: 'partial',
            principal_paise: 10000n,
            interest_paise: 1000n,
            principal_paid_paise: 5000n,
            interest_paid_paise: 500n,
          },
        ],
        unsettledPenalties: [
          {
            id: 'pen-1',
            amount_paise: 500n,
            penalty_period: '2024-01',
            installment_id: 'inst-1',
          },
        ],
        pendingReversals: [
          { id: 'rev-1', original_collection_id: 'col-1' },
        ],
        outstandingBalance: 5000n,
      });
      const service = new LoanService(repo as any);

      try {
        await service.closeLoan('loan-1', 'actor-1', 'manager');
        expect.unreachable('Expected BusinessRuleError');
      } catch (err) {
        expect(err).toBeInstanceOf(BusinessRuleError);
        const msg = (err as BusinessRuleError).message;
        expect(msg).toContain('Unpaid installments');
        expect(msg).toContain('Unsettled penalties');
        expect(msg).toContain('Pending reversals');
        expect(msg).toContain('Outstanding balance');
      }
    });
  });

  describe('prevents reopening closed loans (Requirement 10.4)', () => {
    it('rejects transition from closed to any other status', () => {
      const service = new LoanService(null as any);
      const statuses = [
        'draft', 'submitted', 'under_review', 'approved',
        'disbursed', 'active', 'overdue', 'defaulted', 'foreclosed',
      ];

      for (const target of statuses) {
        expect(() => { service.validateTransition('closed', target); }).toThrow(
          BusinessRuleError,
        );
      }
    });
  });
});
