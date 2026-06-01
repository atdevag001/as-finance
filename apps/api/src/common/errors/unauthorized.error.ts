import { AppError } from './app.error';

/**
 * Thrown when a request is not authenticated (missing/invalid credentials,
 * expired/revoked token). Maps to HTTP 401.
 *
 * Distinct from AuthorizationError (403) which signals "authenticated but
 * lacks permission".
 */
export class UnauthorizedError extends AppError {
  constructor(message: string, code = 'UNAUTHORIZED') {
    super(message, code, 401);
  }
}
