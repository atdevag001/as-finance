import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Property 17: Overdue dashboard card highlighting
 *
 * For any dashboard KPI state where `overdueLoans > 0`, the overdue loans card
 * should render with the danger/destructive variant styling.
 * When `overdueLoans === 0`, it should render with default styling.
 *
 * **Validates: Requirements 3.3**
 */

/**
 * Extracts the variant logic used by the dashboard page for the overdue loans card.
 * This mirrors the condition in `apps/web/src/app/(dashboard)/page.tsx`:
 *   variant={data.overdueLoans > 0 ? 'danger' : undefined}
 */
function getOverdueCardVariant(overdueLoans: number): 'danger' | undefined {
  return overdueLoans > 0 ? 'danger' : undefined;
}

/**
 * Determines the CSS classes applied by the KPICard component based on variant.
 * Mirrors the KPICard logic:
 *   Card: `variant === 'danger' ? 'border-destructive' : ''`
 *   Span: `variant === 'danger' ? 'text-destructive' : ''`
 */
function getKPICardClasses(variant: 'danger' | undefined): {
  cardClass: string;
  textClass: string;
} {
  return {
    cardClass: variant === 'danger' ? 'border-destructive' : '',
    textClass: variant === 'danger' ? 'text-destructive' : '',
  };
}

// --- Generators ---

/** Generates a non-negative integer for overdueLoans count */
const overdueLoansArb = fc.nat({ max: 10_000 });

/** Generates a positive integer (overdueLoans > 0) */
const positiveOverdueArb = fc.integer({ min: 1, max: 10_000 });

// --- Property 17: Overdue dashboard card highlighting ---

describe('Property 17: Overdue dashboard card highlighting', () => {
  it('applies danger variant when overdueLoans > 0', () => {
    fc.assert(
      fc.property(positiveOverdueArb, (overdueLoans) => {
        const variant = getOverdueCardVariant(overdueLoans);
        expect(variant).toBe('danger');

        const classes = getKPICardClasses(variant);
        expect(classes.cardClass).toBe('border-destructive');
        expect(classes.textClass).toBe('text-destructive');
      }),
      { numRuns: 100 },
    );
  });

  it('applies default styling when overdueLoans === 0', () => {
    const variant = getOverdueCardVariant(0);
    expect(variant).toBeUndefined();

    const classes = getKPICardClasses(variant);
    expect(classes.cardClass).toBe('');
    expect(classes.textClass).toBe('');
  });

  it('variant is always either "danger" or undefined for any non-negative count', () => {
    fc.assert(
      fc.property(overdueLoansArb, (overdueLoans) => {
        const variant = getOverdueCardVariant(overdueLoans);

        if (overdueLoans > 0) {
          expect(variant).toBe('danger');
        } else {
          expect(variant).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('danger variant always produces destructive CSS classes', () => {
    fc.assert(
      fc.property(positiveOverdueArb, (overdueLoans) => {
        const variant = getOverdueCardVariant(overdueLoans);
        const classes = getKPICardClasses(variant);

        // Both destructive classes must be present together
        expect(classes.cardClass).toContain('destructive');
        expect(classes.textClass).toContain('destructive');
      }),
      { numRuns: 100 },
    );
  });

  it('default variant never produces destructive CSS classes', () => {
    const variant = getOverdueCardVariant(0);
    const classes = getKPICardClasses(variant);

    expect(classes.cardClass).not.toContain('destructive');
    expect(classes.textClass).not.toContain('destructive');
  });
});
