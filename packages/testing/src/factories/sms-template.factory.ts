import { NotificationEvent } from '@as-finance/shared';
import { buildEntity, randomUUID } from './helpers.js';

/**
 * SmsTemplate — represents an SMS message template.
 * Maps to `sms_templates` Prisma model fields.
 */
export interface SmsTemplate {
  id: string;
  eventType: NotificationEvent;
  language: string;
  templateBody: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function buildSmsTemplate(
  overrides?: Partial<SmsTemplate>,
): SmsTemplate {
  const now = new Date();
  return buildEntity<SmsTemplate>(
    {
      id: randomUUID(),
      eventType: NotificationEvent.COLLECTION_RECEIPT,
      language: 'en',
      templateBody: 'Dear {{customerName}}, payment of Rs {{amount}} received for loan {{loanNumber}}. Receipt: {{receiptNumber}}.',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    overrides,
  );
}
