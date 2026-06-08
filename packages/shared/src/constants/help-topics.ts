/**
 * Help topic registry — the contract between code and the user guide.
 *
 * Each topic maps to a (chapter, section) pair in apps/web/src/app/(dashboard)/help/_content.
 * The <HelpLink topic="..."> component in the app uses this to open the side-sheet at
 * /help/<chapter>?lang=<current>#<section>.
 *
 * Adding a topic here without a matching section, or removing a section that a topic points to,
 * fails `pnpm test:help-coverage` — so the registry stays drift-proof.
 */
export const HELP_TOPICS = {
  // Loans
  LOAN_CREATE: { chapter: 'loans', section: 'create' },
  LOAN_APPROVE: { chapter: 'loans', section: 'approve' },
  LOAN_DISBURSE: { chapter: 'loans', section: 'disburse' },
  LOAN_FORECLOSE: { chapter: 'loans', section: 'foreclose' },
  LOAN_CLOSE: { chapter: 'loans', section: 'close' },
  LOAN_EMI_CALC: { chapter: 'loans', section: 'emi-calculation' },

  // Collections
  COLLECTION_POST: { chapter: 'collections', section: 'post' },
  COLLECTION_REVERSE: { chapter: 'collections', section: 'reverse' },
  COLLECTION_SAFE_RETRY: { chapter: 'collections', section: 'safe-retry' },

  // Cashbook
  CASHBOOK_DAY_END: { chapter: 'cashbook', section: 'day-end' },
  CASHBOOK_SHORTAGE: { chapter: 'cashbook', section: 'shortage' },
  CASHBOOK_EXPENSE: { chapter: 'cashbook', section: 'record-expense' },

  // Customers
  CUSTOMER_NEW: { chapter: 'customers', section: 'create' },
  CUSTOMER_DUPLICATE: { chapter: 'customers', section: 'duplicate-warning' },
  CUSTOMER_BLACKLIST: { chapter: 'customers', section: 'blacklist' },

  // Groups
  GROUP_CREATE: { chapter: 'groups', section: 'create' },
  GROUP_COLLECT: { chapter: 'groups', section: 'group-collect' },

  // Roles / concepts
  MAKER_CHECKER: { chapter: 'roles', section: 'maker-checker' },
  AUDIT_TRAIL: { chapter: 'roles', section: 'audit-trail' },
  AADHAAR_PRIVACY: { chapter: 'roles', section: 'aadhaar-privacy' },
} as const;

export type HelpTopicId = keyof typeof HELP_TOPICS;
export type HelpTopic = (typeof HELP_TOPICS)[HelpTopicId];

/**
 * Build a URL fragment for a given topic, e.g.
 *   helpTopicHref('LOAN_APPROVE', 'hi') → '/help/loans?lang=hi#approve'
 */
export function helpTopicHref(topic: HelpTopicId, lang: 'en' | 'hi' | 'hinglish' = 'en'): string {
  const { chapter, section } = HELP_TOPICS[topic];
  return `/help/${chapter}?lang=${lang}#${section}`;
}
