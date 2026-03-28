import { describe, it, expect } from 'vitest';
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
} from '../index';

describe('Error classes', () => {
  it('AppError sets message, code, and statusCode', () => {
    const err = new AppError('test', 'TEST_CODE', 500);
    expect(err.message).toBe('test');
    expect(err.code).toBe('TEST_CODE');
    expect(err.statusCode).toBe(500);
    expect(err.name).toBe('AppError');
    expect(err).toBeInstanceOf(Error);
  });

  it('BusinessRuleError defaults to 422', () => {
    const err = new BusinessRuleError('invalid transition');
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(err).toBeInstanceOf(AppError);
  });

  it('ConflictError defaults to 409', () => {
    const err = new ConflictError('duplicate key');
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err).toBeInstanceOf(AppError);
  });

  it('ValidationError defaults to 400', () => {
    const err = new ValidationError('bad input');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err).toBeInstanceOf(AppError);
  });

  it('NotFoundError defaults to 404', () => {
    const err = new NotFoundError('not found');
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err).toBeInstanceOf(AppError);
  });

  it('AuthorizationError defaults to 403', () => {
    const err = new AuthorizationError('forbidden');
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err).toBeInstanceOf(AppError);
  });

  it('allows custom error codes', () => {
    const err = new ValidationError('bad', 'CUSTOM_CODE');
    expect(err.code).toBe('CUSTOM_CODE');
    expect(err.statusCode).toBe(400);
  });
});
