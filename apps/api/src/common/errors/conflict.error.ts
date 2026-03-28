import { AppError } from './app.error';

/**
 * Thrown on resource conflicts (e.g., duplicate idempotency key,
 * optimistic locking failure). Maps to HTTP 409.
 */
export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT') {
    super(message, code, 409);
  }
}
