import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../errors';
import { getRequestId } from '../middleware/request-id.middleware';

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

    // NestJS built-in HTTP exceptions (ValidationPipe, guards, etc.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      const message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : (exceptionResponse as { message?: string | string[] }).message ??
            exception.message;

      return {
        statusCode: status,
        code: HttpStatus[status] ?? 'HTTP_ERROR',
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
