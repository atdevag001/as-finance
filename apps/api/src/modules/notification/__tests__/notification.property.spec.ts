import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';
import { NotificationService } from '../notification.service';
import { NotificationRepository } from '../notification.repository';
import { MockSmsProvider } from '../sms-provider';
import { renderTemplate } from '../render-template';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function createMockRepository() {
  return {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    findTemplate: vi.fn(),
    resetForRetry: vi.fn(),
  } as unknown as NotificationRepository;
}

function createService(repo: NotificationRepository) {
  return new NotificationService(repo, new MockSmsProvider());
}

// ─── Generators ────────────────────────────────────────────────────────────────

/** Generates a valid notification event type */
const eventTypeArb = fc.constantFrom(
  'loan_approved',
  'loan_rejected',
  'disbursed',
  'collection_receipt',
  'emi_reminder',
  'overdue_reminder',
  'penalty_notice',
  'daily_collection_summary',
);

/** Generates a valid Indian mobile number (10 digits starting with 6-9) */
const mobileArb = fc
  .integer({ min: 6, max: 9 })
  .chain((first) =>
    fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
      minLength: 9,
      maxLength: 9,
    }).map((rest) => `${first}${rest}`),
  );

/** Generates a source type for the notification */
const sourceTypeArb = fc.constantFrom('loan', 'disbursement', 'collection', 'penalty');

// ─── Property 33: Notification Outbox Transactional Consistency ────────────────

/**
 * Property 33: Notification Outbox Transactional Consistency
 *
 * For all finance transactions that trigger notifications, the outbox message
 * is created within the same database transaction. If the finance tx rolls back,
 * the outbox message also rolls back.
 *
 * We verify this by checking that enqueue() passes the transaction client through
 * to repository.create(), ensuring the outbox write participates in the caller's
 * transaction boundary.
 *
 * **Validates: Requirements 18.2**
 */
describe('Property 33: Notification Outbox Transactional Consistency', () => {
  it('for all enqueue calls with a tx client, the tx client is forwarded to repository.create()', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventTypeArb,
        mobileArb,
        sourceTypeArb,
        fc.uuid(),
        async (eventType, mobile, sourceType, sourceId) => {
          const repo = createMockRepository();
          const service = createService(repo);

          // Template lookup returns null so we use fallback (simpler path)
          vi.mocked(repo.findTemplate).mockResolvedValue(null);
          vi.mocked(repo.create).mockResolvedValue({ id: 'msg-1', status: 'pending' } as never);

          // Simulate a Prisma transaction client
          const fakeTx = { outbox_messages: {}, $queryRawUnsafe: vi.fn() } as never;

          await service.enqueue(
            {
              event_type: eventType,
              recipient_mobile: mobile,
              variables: {},
              source_type: sourceType,
              source_id: sourceId,
            },
            fakeTx,
          );

          // The critical assertion: repository.create received the tx client
          expect(repo.create).toHaveBeenCalledTimes(1);
          const [, passedTx] = vi.mocked(repo.create).mock.calls[0]!;
          expect(passedTx).toBe(fakeTx);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for all enqueue calls without a tx client, repository.create() receives undefined (uses default client)', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventTypeArb,
        mobileArb,
        sourceTypeArb,
        fc.uuid(),
        async (eventType, mobile, sourceType, sourceId) => {
          const repo = createMockRepository();
          const service = createService(repo);

          vi.mocked(repo.findTemplate).mockResolvedValue(null);
          vi.mocked(repo.create).mockResolvedValue({ id: 'msg-1', status: 'pending' } as never);

          await service.enqueue({
            event_type: eventType,
            recipient_mobile: mobile,
            variables: {},
            source_type: sourceType,
            source_id: sourceId,
          });

          expect(repo.create).toHaveBeenCalledTimes(1);
          const [, passedTx] = vi.mocked(repo.create).mock.calls[0]!;
          expect(passedTx).toBeUndefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('for all enqueue calls with a tx client and a template, the tx client is still forwarded', async () => {
    await fc.assert(
      fc.asyncProperty(
        eventTypeArb,
        mobileArb,
        sourceTypeArb,
        fc.uuid(),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (eventType, mobile, sourceType, sourceId, templateBody) => {
          const repo = createMockRepository();
          const service = createService(repo);

          vi.mocked(repo.findTemplate).mockResolvedValue({
            id: 'tpl-1',
            template_body: templateBody,
          } as never);
          vi.mocked(repo.create).mockResolvedValue({ id: 'msg-1', status: 'pending' } as never);

          const fakeTx = { outbox_messages: {}, $queryRawUnsafe: vi.fn() } as never;

          await service.enqueue(
            {
              event_type: eventType,
              recipient_mobile: mobile,
              variables: {},
              source_type: sourceType,
              source_id: sourceId,
            },
            fakeTx,
          );

          expect(repo.create).toHaveBeenCalledTimes(1);
          const [, passedTx] = vi.mocked(repo.create).mock.calls[0]!;
          expect(passedTx).toBe(fakeTx);
        },
      ),
      { numRuns: 100 },
    );
  });
});


// ─── Property 34: SMS Template Rendering ───────────────────────────────────────

/**
 * Property 34: SMS Template Rendering
 *
 * For all templates and valid variable maps, rendering substitutes all
 * {{variable}} placeholders; no unsubstituted placeholders remain.
 *
 * **Validates: Requirements 18.5**
 */

// --- Generators for Property 34 ---

/** Generates a variable name (word characters, 1-20 chars) */
const varNameArb = fc.stringOf(
  fc.constantFrom(
    ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_'.split(''),
  ),
  { minLength: 1, maxLength: 20 },
).filter((s) => /^\w+$/.test(s));

/** Generates a non-empty variable value (no mustache braces) */
const varValueArb = fc.string({ minLength: 1, maxLength: 50 }).filter(
  (s) => !s.includes('{{') && !s.includes('}}'),
);

/**
 * Generates a template string with embedded {{variable}} placeholders
 * and a matching variable map that covers all placeholders.
 */
const templateWithVarsArb = fc
  .array(varNameArb, { minLength: 1, maxLength: 10 })
  .chain((varNames) => {
    // Deduplicate variable names
    const uniqueNames = [...new Set(varNames)];

    // Generate a value for each variable
    return fc
      .tuple(
        ...uniqueNames.map(() => varValueArb),
      )
      .map((values) => {
        const variables: Record<string, string> = {};
        uniqueNames.forEach((name, i) => {
          variables[name] = values[i]!;
        });

        // Build a template with literal text interspersed with placeholders
        const parts: string[] = [];
        for (const name of uniqueNames) {
          parts.push(`Hello {{${name}}}`);
        }
        const templateBody = parts.join(', ');

        return { templateBody, variables };
      });
  });

/** Regex that matches any remaining unsubstituted {{...}} placeholder */
const PLACEHOLDER_RE = /\{\{\w+\}\}/;

describe('Property 34: SMS Template Rendering', () => {
  it('for all templates with matching variable maps, no unsubstituted placeholders remain', () => {
    fc.assert(
      fc.property(templateWithVarsArb, ({ templateBody, variables }) => {
        const rendered = renderTemplate(templateBody, variables);
        expect(rendered).not.toMatch(PLACEHOLDER_RE);
      }),
      { numRuns: 500 },
    );
  });

  it('for all templates, each placeholder is replaced with its corresponding variable value', () => {
    fc.assert(
      fc.property(templateWithVarsArb, ({ templateBody, variables }) => {
        const rendered = renderTemplate(templateBody, variables);

        // Each variable value should appear in the rendered output
        for (const [name, value] of Object.entries(variables)) {
          // Only check if the placeholder was actually in the template
          if (templateBody.includes(`{{${name}}}`)) {
            expect(rendered).toContain(value);
          }
        }
      }),
      { numRuns: 500 },
    );
  });

  it('for all templates with empty variable maps, placeholders are replaced with empty strings', () => {
    fc.assert(
      fc.property(
        fc.array(varNameArb, { minLength: 1, maxLength: 5 }).map((names) => {
          const unique = [...new Set(names)];
          return unique.map((n) => `{{${n}}}`).join(' ');
        }),
        (templateBody) => {
          const rendered = renderTemplate(templateBody, {});

          // No placeholders should remain (they get replaced with '')
          expect(rendered).not.toMatch(PLACEHOLDER_RE);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('for all templates with no placeholders, rendering returns the original string unchanged', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 200 }).filter((s) => !PLACEHOLDER_RE.test(s)),
        (plainText) => {
          const rendered = renderTemplate(plainText, { anyKey: 'anyValue' });
          expect(rendered).toBe(plainText);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rendering is deterministic: same template + variables always produces same output', () => {
    fc.assert(
      fc.property(templateWithVarsArb, ({ templateBody, variables }) => {
        const result1 = renderTemplate(templateBody, variables);
        const result2 = renderTemplate(templateBody, variables);
        expect(result1).toBe(result2);
      }),
      { numRuns: 200 },
    );
  });
});
