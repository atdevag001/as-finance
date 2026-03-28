import { AppError } from './app.error';

/**
 * Thrown when a user lacks permission for the requested action. Maps to HTTP 403.
 */
export class AuthorizationError extends AppError {
  constructor(message: string, code = 'FORBIDDEN') {
    super(message, code, 403);
  }
}
