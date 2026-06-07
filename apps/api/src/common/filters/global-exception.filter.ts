import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as multer from 'multer';
import { AppError } from '../errors';
import { getRequestId } from '../middleware/request-id.middleware';

// Use namespace import for multer (uses `export =`) so MulterError resolves
// reliably under both CommonJS and ESM module resolution.
const { MulterError } = multer;

// Stable client codes for Multer limit violations so the frontend can render
// targeted UX (e.g. "File exceeds 5 MB") instead of a generic 500.
const MULTER_ERROR_CODE_MAP: Record<string, string> = {
  LIMIT_FILE_SIZE: 'FILE_TOO_LARGE',
  LIMIT_FILE_COUNT: 'TOO_MANY_FILES',
  LIMIT_UNEXPECTED_FILE: 'UNEXPECTED_FILE',
  LIMIT_PART_COUNT: 'TOO_MANY_PARTS',
  LIMIT_FIELD_KEY: 'FIELD_NAME_TOO_LONG',
  LIMIT_FIELD_VALUE: 'FIELD_VALUE_TOO_LONG',
  LIMIT_FIELD_COUNT: 'TOO_MANY_FIELDS',
  MISSING_FIELD_NAME: 'MISSING_FIELD_NAME',
};

const MULTER_ERROR_MESSAGE_MAP: Record<string, string> = {
  LIMIT_FILE_SIZE: 'File exceeds the allowed size limit',
  LIMIT_FILE_COUNT: 'Too many files uploaded',
  LIMIT_UNEXPECTED_FILE: 'Unexpected file field',
  LIMIT_PART_COUNT: 'Too many parts in the multipart request',
  LIMIT_FIELD_KEY: 'Field name too long',
  LIMIT_FIELD_VALUE: 'Field value too long',
  LIMIT_FIELD_COUNT: 'Too many fields',
  MISSING_FIELD_NAME: 'Field name missing',
};

interface ErrorResponseBody {
  statusCode: number;
  code: string;
  message: string;
  requestId: string;
  timestamp: string;
}

/**
 * Catches all exceptions and maps them to a consistent JSON response.
 *
 * - Custom AppError subclasses → their statusCode / code
 * - NestJS HttpException → its status / message
 * - Unknown errors → 500 Internal Server Error
 *
 * Stack traces are NEVER included in the response body.
 * Detailed error info is logged server-side with the requestId for correlation.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = request.requestId ?? getRequestId();

    const { statusCode, code, message } = this.resolveError(exception);

    // Structured server-side log — includes stack for debugging
    this.logger.error(
      {
        requestId,
        statusCode,
        code,
        path: request.url,
        method: request.method,
        ...(exception instanceof Error && { stack: exception.stack }),
      },
      message,
    );

    const body: ErrorResponseBody = {
      statusCode,
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }

  private resolveError(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
  } {
    // Custom application errors
    if (exception instanceof AppError) {
      return {
        statusCode: exception.statusCode,
        code: exception.code,
        message: exception.message,
      };
    }

    // Multer limit/upload errors — surface as 400 with a stable code so the
    // frontend can show "File exceeds 5 MB" instead of a generic 500.
    if (exception instanceof MulterError) {
      const code = MULTER_ERROR_CODE_MAP[exception.code] ?? 'UPLOAD_ERROR';
      const message =
        MULTER_ERROR_MESSAGE_MAP[exception.code] ?? exception.message ?? 'Upload error';
      return {
        statusCode: HttpStatus.BAD_REQUEST,
        code,
        message,
      };
    }

    // NestJS built-in HTTP exceptions (ValidationPipe, guards, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as { message?: string | string[] }).message ??
            exception.message;
      // Allow callers to embed a stable client-facing code in the response
      // payload (e.g. INVALID_MIME_TYPE) instead of the generic HTTP status name.
      const customCode =
        typeof exceptionResponse === 'object' && exceptionResponse !== null
          ? (exceptionResponse as { code?: string }).code
          : undefined;

      return {
        statusCode: status,
        code: customCode ?? HttpStatus[status] ?? 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join('; ') : message,
      };
    }

    // Unknown / unexpected errors — never leak internals
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
    };
  }
}
