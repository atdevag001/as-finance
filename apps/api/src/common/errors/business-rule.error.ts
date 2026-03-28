import { AppError } from './app.error';

/**
 * Thrown when a business rule is violated (e.g., invalid state transition,
 * disbursement prerequisites not met). Maps to HTTP 422.
 */
export class BusinessRuleError extends AppError {
  constructor(message: string, code = 'BUSINESS_RULE_VIOLATION') {
    super(message, code, 422);
  }
}
