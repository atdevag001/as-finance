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
  describe('AppError', () => {
    it('sets message, code, and statusCode', () => {
      const err = new AppError('something broke', 'INTERNAL', 500);
      expect(err.message).toBe('something broke');
      expect(err.code).toBe('INTERNAL');
      expect(err.statusCode).toBe(500);
    });

    it('sets name to AppError', () => {
      const err = new AppError('test', 'TEST', 500);
      expect(err.name).toBe('AppError');
    });

    it('is an instance of Error', () => {
      const err = new AppError('test', 'TEST', 500);
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(AppError);
    });

    it('has a stack trace', () => {
      const err = new AppError('test', 'TEST', 500);
      expect(err.stack).toBeDefined();
    });
  });

  describe('BusinessRuleError', () => {
    it('defaults to statusCode 422 and code BUSINESS_RULE_VIOLATION', () => {
      const err = new BusinessRuleError('invalid transition');
      expect(err.statusCode).toBe(422);
      expect(err.code).toBe('BUSINESS_RULE_VIOLATION');
    });

    it('preserves the message', () => {
      const err = new BusinessRuleError('loan not active');
      expect(err.message).toBe('loan not active');
    });

    it('sets name to BusinessRuleError', () => {
      const err = new BusinessRuleError('test');
      expect(err.name).toBe('BusinessRuleError');
    });

    it('extends AppError and Error', () => {
      const err = new BusinessRuleError('test');
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    });

    it('allows a custom error code', () => {
      const err = new BusinessRuleError('bad', 'CUSTOM_BIZ');
      expect(err.code).toBe('CUSTOM_BIZ');
      expect(err.statusCode).toBe(422);
    });
  });

  describe('NotFoundError', () => {
    it('defaults to statusCode 404 and code NOT_FOUND', () => {
      const err = new NotFoundError('loan not found');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
    });

    it('preserves the message', () => {
      const err = new NotFoundError('customer 123 missing');
      expect(err.message).toBe('customer 123 missing');
    });

    it('sets name to NotFoundError', () => {
      const err = new NotFoundError('test');
      expect(err.name).toBe('NotFoundError');
    });

    it('extends AppError and Error', () => {
      const err = new NotFoundError('test');
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    });

    it('allows a custom error code', () => {
      const err = new NotFoundError('gone', 'RESOURCE_GONE');
      expect(err.code).toBe('RESOURCE_GONE');
      expect(err.statusCode).toBe(404);
    });
  });

  describe('AuthorizationError', () => {
    it('defaults to statusCode 403 and code FORBIDDEN', () => {
      const err = new AuthorizationError('not allowed');
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    });

    it('preserves the message', () => {
      const err = new AuthorizationError('insufficient role');
      expect(err.message).toBe('insufficient role');
    });

    it('sets name to AuthorizationError', () => {
      const err = new AuthorizationError('test');
      expect(err.name).toBe('AuthorizationError');
    });

    it('extends AppError and Error', () => {
      const err = new AuthorizationError('test');
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    });

    it('allows a custom error code', () => {
      const err = new AuthorizationError('nope', 'UNAUTHORIZED');
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.statusCode).toBe(403);
    });
  });

  describe('ValidationError', () => {
    it('defaults to statusCode 400 and code VALIDATION_ERROR', () => {
      const err = new ValidationError('bad input');
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe('VALIDATION_ERROR');
    });

    it('preserves the message', () => {
      const err = new ValidationError('invalid aadhaar');
      expect(err.message).toBe('invalid aadhaar');
    });

    it('sets name to ValidationError', () => {
      const err = new ValidationError('test');
      expect(err.name).toBe('ValidationError');
    });

    it('extends AppError and Error', () => {
      const err = new ValidationError('test');
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    });

    it('allows a custom error code', () => {
      const err = new ValidationError('bad', 'INVALID_FORMAT');
      expect(err.code).toBe('INVALID_FORMAT');
      expect(err.statusCode).toBe(400);
    });
  });

  describe('ConflictError', () => {
    it('defaults to statusCode 409 and code CONFLICT', () => {
      const err = new ConflictError('duplicate key');
      expect(err.statusCode).toBe(409);
      expect(err.code).toBe('CONFLICT');
    });

    it('preserves the message', () => {
      const err = new ConflictError('idempotency collision');
      expect(err.message).toBe('idempotency collision');
    });

    it('sets name to ConflictError', () => {
      const err = new ConflictError('test');
      expect(err.name).toBe('ConflictError');
    });

    it('extends AppError and Error', () => {
      const err = new ConflictError('test');
      expect(err).toBeInstanceOf(AppError);
      expect(err).toBeInstanceOf(Error);
    });

    it('allows a custom error code', () => {
      const err = new ConflictError('dup', 'DUPLICATE_ENTRY');
      expect(err.code).toBe('DUPLICATE_ENTRY');
      expect(err.statusCode).toBe(409);
    });
  });
});
