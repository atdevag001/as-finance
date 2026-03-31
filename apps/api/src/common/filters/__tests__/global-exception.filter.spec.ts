import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { GlobalExceptionFilter } from '../global-exception.filter';
import {
  AppError,
  BusinessRuleError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AuthorizationError,
} from '../../errors';

function createMockHost(requestOverrides: Record<string, unknown> = {}) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const response = { status };
  const request = {
    url: '/test',
    method: 'GET',
    requestId: 'req-123',
    ...requestOverrides,
  };
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
    json,
    status,
  };
}

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    filter = new GlobalExceptionFilter();
  });

  // --- Requirement 48.1: BusinessRuleError → 422 ---

  it('maps BusinessRuleError to 422 with correct body', () => {
    const host = createMockHost();
    filter.catch(new BusinessRuleError('bad transition'), host as any);
    expect(host.status).toHaveBeenCalledWith(422);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 422,
        code: 'BUSINESS_RULE_VIOLATION',
        message: 'bad transition',
        requestId: 'req-123',
      }),
    );
  });

  // --- Requirement 48.2: NotFoundError → 404 ---

  it('maps NotFoundError to 404 with correct body', () => {
    const host = createMockHost();
    filter.catch(new NotFoundError('missing'), host as any);
    expect(host.status).toHaveBeenCalledWith(404);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        code: 'NOT_FOUND',
        message: 'missing',
        requestId: 'req-123',
      }),
    );
  });

  // --- Requirement 48.3: AuthorizationError → 401 or 403 ---

  it('maps AuthorizationError to 403 (forbidden)', () => {
    const host = createMockHost();
    filter.catch(new AuthorizationError('denied'), host as any);
    expect(host.status).toHaveBeenCalledWith(403);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        code: 'FORBIDDEN',
        message: 'denied',
        requestId: 'req-123',
      }),
    );
  });

  it('maps NestJS UnauthorizedException to 401', () => {
    const host = createMockHost();
    filter.catch(new UnauthorizedException('invalid token'), host as any);
    expect(host.status).toHaveBeenCalledWith(401);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        requestId: 'req-123',
      }),
    );
  });

  // --- Requirement 48.4: ValidationError → 400 ---

  it('maps ValidationError to 400 with correct body', () => {
    const host = createMockHost();
    filter.catch(new ValidationError('invalid input'), host as any);
    expect(host.status).toHaveBeenCalledWith(400);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'invalid input',
        requestId: 'req-123',
      }),
    );
  });

  // --- Requirement 48.5: ConflictError → 409 ---

  it('maps ConflictError to 409 with correct body', () => {
    const host = createMockHost();
    filter.catch(new ConflictError('duplicate key'), host as any);
    expect(host.status).toHaveBeenCalledWith(409);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        code: 'CONFLICT',
        message: 'duplicate key',
        requestId: 'req-123',
      }),
    );
  });

  // --- Requirement 48.6: Unhandled errors → 500 with safe message ---

  it('maps unknown errors to 500 without leaking details', () => {
    const host = createMockHost();
    filter.catch(new Error('secret internal error'), host as any);
    expect(host.status).toHaveBeenCalledWith(500);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
        requestId: 'req-123',
      }),
    );
  });

  it('never exposes stack traces in the response body', () => {
    const host = createMockHost();
    const err = new Error('oops');
    err.stack = 'Error: oops\n    at secret/path.ts:42';
    filter.catch(err, host as any);
    const body = host.json.mock.calls[0]![0];
    expect(JSON.stringify(body)).not.toContain('stack');
    expect(JSON.stringify(body)).not.toContain('secret/path');
  });

  it('maps non-Error thrown values to 500 with safe message', () => {
    const host = createMockHost();
    filter.catch('string thrown', host as any);
    expect(host.status).toHaveBeenCalledWith(500);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
      }),
    );
  });

  // --- Requirement 48.7: requestId in all responses ---

  it('includes requestId and timestamp in every error response', () => {
    const errorCases = [
      new BusinessRuleError('rule'),
      new NotFoundError('not found'),
      new AuthorizationError('forbidden'),
      new ValidationError('invalid'),
      new ConflictError('conflict'),
      new HttpException('http error', HttpStatus.METHOD_NOT_ALLOWED),
      new Error('unhandled'),
    ];

    for (const error of errorCases) {
      const host = createMockHost();
      filter.catch(error, host as any);
      const body = host.json.mock.calls[0]![0];
      expect(body.requestId).toBe('req-123');
      expect(body.timestamp).toBeDefined();
      expect(typeof body.timestamp).toBe('string');
    }
  });

  // --- Additional: NestJS HttpException passthrough ---

  it('maps NestJS HttpException to its status', () => {
    const host = createMockHost();
    filter.catch(new HttpException('not allowed', HttpStatus.METHOD_NOT_ALLOWED), host as any);
    expect(host.status).toHaveBeenCalledWith(405);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 405,
        requestId: 'req-123',
      }),
    );
  });

  // --- Additional: AppError with custom status ---

  it('maps custom AppError to its configured status code', () => {
    const host = createMockHost();
    filter.catch(new AppError('teapot', 'IM_A_TEAPOT', 418), host as any);
    expect(host.status).toHaveBeenCalledWith(418);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 418,
        code: 'IM_A_TEAPOT',
        message: 'teapot',
        requestId: 'req-123',
      }),
    );
  });
});
