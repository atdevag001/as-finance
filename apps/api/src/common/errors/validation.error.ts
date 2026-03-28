import { AppError } from './app.error';

/**
 * Thrown when input validation fails (e.g., invalid Aadhaar format,
 * out-of-range principal). Maps to HTTP 400.
 */
export class ValidationError extends AppError {
  constructor(message: string, code = 'VALIDATION_ERROR') {
    super(message, code, 400);
  }
}
