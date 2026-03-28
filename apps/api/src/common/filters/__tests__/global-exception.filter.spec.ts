import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
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

  it('maps BusinessRuleError to 422', () => {
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

  it('maps NotFoundError to 404', () => {
    const host = createMockHost();
    filter.catch(new NotFoundError('missing'), host as any);
    expect(host.status).toHaveBeenCalledWith(404);
  });

  it('maps ValidationError to 400', () => {
    const host = createMockHost();
    filter.catch(new ValidationError('invalid'), host as any);
    expect(host.status).toHaveBeenCalledWith(400);
  });

  it('maps ConflictError to 409', () => {
    const host = createMockHost();
    filter.catch(new ConflictError('duplicate'), host as any);
    expect(host.status).toHaveBeenCalledWith(409);
  });

  it('maps AuthorizationError to 403', () => {
    const host = createMockHost();
    filter.catch(new AuthorizationError('denied'), host as any);
    expect(host.status).toHaveBeenCalledWith(403);
  });

  it('maps NestJS HttpException to its status', () => {
    const host = createMockHost();
    filter.catch(new HttpException('not allowed', HttpStatus.METHOD_NOT_ALLOWED), host as any);
    expect(host.status).toHaveBeenCalledWith(405);
  });

  it('maps unknown errors to 500 without leaking details', () => {
    const host = createMockHost();
    filter.catch(new Error('secret internal error'), host as any);
    expect(host.status).toHaveBeenCalledWith(500);
    expect(host.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred',
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

  it('includes requestId and timestamp in every response', () => {
    const host = createMockHost();
    filter.catch(new AppError('test', 'TEST', 418), host as any);
    const body = host.json.mock.calls[0]![0];
    expect(body.requestId).toBe('req-123');
    expect(body.timestamp).toBeDefined();
  });
});
