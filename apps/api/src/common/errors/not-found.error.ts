import { AppError } from './app.error';

/**
 * Thrown when a requested resource does not exist. Maps to HTTP 404.
 */
export class NotFoundError extends AppError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, code, 404);
  }
}
