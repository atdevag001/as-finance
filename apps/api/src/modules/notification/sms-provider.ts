/**
 * Result of an SMS dispatch attempt.
 */
export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Pluggable SMS provider abstraction (Requirement 18.3).
 * Allows provider replacement without code changes to core notification logic.
 */
export interface SmsProvider {
  send(to: string, message: string): Promise<SmsResult>;
}

export const SMS_PROVIDER = 'SMS_PROVIDER';

/**
 * Mock SMS provider for testing and development.
 * Logs messages to console and always succeeds.
 */
export class MockSmsProvider implements SmsProvider {
  private readonly sentMessages: Array<{ to: string; message: string }> = [];

  async send(to: string, message: string): Promise<SmsResult> {
    this.sentMessages.push({ to, message });
    return {
      success: true,
      messageId: `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }

  getSentMessages() {
    return [...this.sentMessages];
  }

  clear() {
    this.sentMessages.length = 0;
  }
}
