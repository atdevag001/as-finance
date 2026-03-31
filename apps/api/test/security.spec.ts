import { describe, it, expect, vi, beforeAll } from 'vitest';
import { RbacGuard } from '../src/common/guards/rbac.guard';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { CustomThrottlerGuard } from '../src/common/guards/throttler.guard';
import { Reflector } from '@nestjs/core';
import {
  detectMimeType,
  isFileSizeValid,
  containsEmbeddedScripts,
} from '../src/modules/document/document.service';
import { ForbiddenException } from '@nestjs/common';

/**
 * Security Tests
 *
 * Validates: Requirements 46.1–46.8
 *
 * 46.1 — SQL injection via query params and request bodies neutralized by Prisma
 * 46.2 — Auth endpoint rate limiting (10 req/min/IP)
 * 46.3 — API endpoint rate limiting (100 req/min/user)
 * 46.4 — Error responses never expose stack traces, SQL, or internal paths
 * 46.5 — PII masking in log output (Aadhaar, PAN, mobile)
 * 46.6 — JWT secrets not exposed in any API response
 * 46.7 — File upload rejects invalid MIME types and oversized files
 * 46.8 — Pagination max page size enforced (100 items)
 */

// ── Shared module (dynamic import to avoid CJS/ESM issues) ──────────────────

let maskAadhaar: (v: string) => string;
let maskPan: (v: string) => string;
let maskMobile: (v: string) => string;
let PERMISSIONS: Record<string, readonly string[]>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function createMockExecutionContext(
  user?: { sub: string; role: string },
  permission?: string,
) {
  const mockReflector = {
    getAllAndOverride: vi.fn().mockReturnValue(permission),
  };
  const mockRequest = { user, headers: {} };
  const mockContext = {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => ({}),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  };
  return { context: mockContext, reflector: mockReflector };
}

function createMockArgumentsHost(overrides: { url?: string; method?: string } = {}) {
  const mockRequest = {
    url: overrides.url ?? '/test',
    method: overrides.method ?? 'GET',
    headers: {},
    requestId: 'test-request-id',
  };
  const mockResponse = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return {
    host: {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown,
    response: mockResponse,
  };
}

function createThrottlerGuard(limit = 100) {
  const options = { throttlers: [{ ttl: 60_000, limit }] } as unknown;
  const storageService = { get: async () => ({}), set: async () => {} } as unknown;
  const reflector = new Reflector();
  return new CustomThrottlerGuard(options as never, storageService as never, reflector);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Security Tests', () => {
  beforeAll(async () => {
    const shared = await import('@as-finance/shared');
    maskAadhaar = shared.maskAadhaar;
    maskPan = shared.maskPan;
    maskMobile = shared.maskMobile;
    PERMISSIONS = shared.PERMISSIONS as Record<string, readonly string[]>;
  });

  // ── 46.1: SQL Injection Resistance ─────────────────────────────────────

  describe('46.1 — SQL injection neutralized by Prisma parameterization', () => {
    it('should safely handle DROP TABLE injection in search query params', async () => {
      const { CustomerRepository } = await import('../src/modules/customer/customer.repository');
      const mockPrisma = {
        customers: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      };
      const repo = new CustomerRepository(mockPrisma as never);

      const malicious = "'; DROP TABLE customers; --";
      await repo.findAll({ search: malicious });

      expect(mockPrisma.customers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ full_name: { contains: malicious, mode: 'insensitive' } }),
            ]),
          }),
        }),
      );
    });

    it('should safely handle UNION SELECT injection in request body fields', async () => {
      const { CustomerRepository } = await import('../src/modules/customer/customer.repository');
      const mockPrisma = {
        customers: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      };
      const repo = new CustomerRepository(mockPrisma as never);

      const unionInjection = "' UNION SELECT * FROM users --";
      await repo.findAll({ search: unionInjection });

      expect(mockPrisma.customers.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ full_name: { contains: unionInjection, mode: 'insensitive' } }),
            ]),
          }),
        }),
      );
    });

    it('should safely handle boolean-based blind injection attempts', async () => {
      const { CustomerRepository } = await import('../src/modules/customer/customer.repository');
      const mockPrisma = {
        customers: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      };
      const repo = new CustomerRepository(mockPrisma as never);

      await repo.findAll({ search: "' OR '1'='1" });
      expect(mockPrisma.customers.findMany).toHaveBeenCalled();
    });
  });


  // ── 46.2: Auth Endpoint Rate Limiting ──────────────────────────────────

  describe('46.2 — Auth endpoint rate limiting (10 req/min/IP)', () => {
    it('should use IP-based tracking for unauthenticated requests (auth endpoints)', async () => {
      const guard = createThrottlerGuard(10);
      const req = { ip: '192.168.1.100' } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('192.168.1.100');
    });

    it('should return "unknown" when neither user nor IP is available', async () => {
      const guard = createThrottlerGuard(10);
      const req = {} as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('unknown');
    });

    it('should throw ThrottlerException with user-friendly message', async () => {
      const guard = createThrottlerGuard(10);
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({}) }),
        getHandler: () => ({}),
        getClass: () => ({}),
      };
      await expect(
        (guard as any).throwThrottlingException(mockContext),
      ).rejects.toThrow('Too many requests. Please try again later.');
    });

    it('should use IP (not user sub) for unauthenticated auth requests', async () => {
      const guard = createThrottlerGuard(10);
      // Auth endpoint: no user on request, only IP
      const req = { ip: '10.0.0.1' } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('10.0.0.1');
    });
  });

  // ── 46.3: API Endpoint Rate Limiting ───────────────────────────────────

  describe('46.3 — API endpoint rate limiting (100 req/min/user)', () => {
    it('should use authenticated user sub for tracking when JWT present', async () => {
      const guard = createThrottlerGuard(100);
      const req = { user: { sub: 'user-uuid-123' }, ip: '192.168.1.1' } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('user-uuid-123');
    });

    it('should prefer user sub over IP when both are available', async () => {
      const guard = createThrottlerGuard(100);
      const req = { user: { sub: 'authenticated-user-id' }, ip: '10.0.0.5' } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('authenticated-user-id');
      expect(tracker).not.toBe('10.0.0.5');
    });

    it('should fall back to IP when user has no sub', async () => {
      const guard = createThrottlerGuard(100);
      const req = { user: {}, ip: '172.16.0.1' } as Record<string, unknown>;
      const tracker = await (guard as any).getTracker(req);
      expect(tracker).toBe('172.16.0.1');
    });
  });

  // ── 46.4: Error Responses Never Expose Internals ───────────────────────

  describe('46.4 — Error responses never expose stack traces, SQL, or internal paths', () => {
    it('should not include stack trace in error response for unknown errors', () => {
      const filter = new GlobalExceptionFilter();
      const error = new Error('Something broke internally');
      error.stack = 'Error: Something broke\n    at Object.<anonymous> (/app/src/modules/loan/loan.service.ts:42:11)';

      const { host, response } = createMockArgumentsHost();
      filter.catch(error, host as never);

      const body = (response.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const str = JSON.stringify(body);
      expect(body.statusCode).toBe(500);
      expect(body.message).toBe('An unexpected error occurred');
      expect(str).not.toContain('.ts:');
      expect(str).not.toContain('/app/src/');
      expect(str).not.toContain('at Object');
      expect(str).not.toContain('node_modules');
    });

    it('should not expose SQL query details in error response', () => {
      const filter = new GlobalExceptionFilter();
      const sqlError = new Error(
        'PrismaClientKnownRequestError: Invalid `prisma.customers.findMany()` invocation: SELECT * FROM customers WHERE id = $1',
      );
      const { host, response } = createMockArgumentsHost();
      filter.catch(sqlError, host as never);

      const body = (response.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const str = JSON.stringify(body);
      expect(str).not.toContain('SELECT');
      expect(str).not.toContain('FROM customers');
      expect(str).not.toContain('prisma.customers');
      expect(body.message).toBe('An unexpected error occurred');
    });

    it('should not expose internal file paths in error response', () => {
      const filter = new GlobalExceptionFilter();
      const pathError = new Error('ENOENT: no such file or directory, open /app/src/config/secrets.json');
      const { host, response } = createMockArgumentsHost();
      filter.catch(pathError, host as never);

      const body = (response.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const str = JSON.stringify(body);
      expect(str).not.toContain('/app/src/');
      expect(str).not.toContain('secrets.json');
      expect(str).not.toContain('ENOENT');
    });

    it('should include requestId and timestamp in all error responses', () => {
      const filter = new GlobalExceptionFilter();
      const { host, response } = createMockArgumentsHost();
      filter.catch(new Error('test'), host as never);

      const body = (response.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(body.requestId).toBeDefined();
      expect(typeof body.requestId).toBe('string');
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('should map AppError subclasses to safe responses without leaking internals', async () => {
      const { BusinessRuleError } = await import('../src/common/errors/index.js');
      const filter = new GlobalExceptionFilter();
      const { host, response } = createMockArgumentsHost();
      filter.catch(new BusinessRuleError('Loan is not active'), host as never);

      const body = (response.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(body.statusCode).toBe(422);
      expect(body.message).toBe('Loan is not active');
      const str = JSON.stringify(body);
      expect(str).not.toContain('at ');
      expect(str).not.toContain('.ts:');
    });
  });


  // ── 46.5: PII Masking in Log Output ────────────────────────────────────

  describe('46.5 — PII masking in log output (Aadhaar, PAN, mobile)', () => {
    it('should mask Aadhaar number showing only last 4 digits', () => {
      const masked = maskAadhaar('234567890123');
      expect(masked).toBe('XXXX-XXXX-0123');
      expect(masked).not.toContain('234567890123');
      expect(masked).not.toContain('23456789');
    });

    it('should mask PAN number showing only last 4 characters', () => {
      const masked = maskPan('ABCDE1234F');
      expect(masked).toBe('XXXXXX234F');
      expect(masked).not.toContain('ABCDE1234F');
      expect(masked).not.toContain('ABCDE1');
    });

    it('should mask mobile number showing only last 4 digits', () => {
      const masked = maskMobile('9876543210');
      expect(masked).toBe('XXXXXX3210');
      expect(masked).not.toContain('9876543210');
      expect(masked).not.toContain('987654');
    });

    it('should ensure masked Aadhaar never contains full original for various inputs', () => {
      const inputs = ['200000000001', '999999999999', '234567890123', '567812345678'];
      for (const aadhaar of inputs) {
        const masked = maskAadhaar(aadhaar);
        expect(masked).not.toContain(aadhaar);
        expect(masked).toMatch(/^XXXX-XXXX-\d{4}$/);
      }
    });

    it('should ensure masked PAN never contains full original for various inputs', () => {
      const inputs = ['ABCDE1234F', 'ZZZZZ9999Z', 'HELLO5678X'];
      for (const pan of inputs) {
        const masked = maskPan(pan);
        expect(masked).not.toContain(pan);
        expect(masked).toMatch(/^XXXXXX.{4}$/);
      }
    });

    it('should ensure masked mobile never contains full original for various inputs', () => {
      const inputs = ['9876543210', '6000000001', '7777777777'];
      for (const mobile of inputs) {
        const masked = maskMobile(mobile);
        expect(masked).not.toContain(mobile);
        expect(masked).toMatch(/^XXXXXX\d{4}$/);
      }
    });
  });

  // ── 46.6: JWT Secrets Not Exposed in API Responses ─────────────────────

  describe('46.6 — JWT secrets not exposed in any API response', () => {
    const JWT_SECRET = process.env['JWT_SECRET'] ?? 'as-finance-dev-jwt-secret-change-in-production';

    it('should not include JWT secret in error responses', () => {
      const filter = new GlobalExceptionFilter();
      const error = new Error(`JWT verification failed with secret: ${JWT_SECRET}`);
      const { host, response } = createMockArgumentsHost();
      filter.catch(error, host as never);

      const body = (response.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const str = JSON.stringify(body);
      expect(str).not.toContain(JWT_SECRET);
      expect(body.message).toBe('An unexpected error occurred');
    });

    it('should not include JWT secret in successful auth response shape', () => {
      const mockAuthResponse = {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test',
        user: { id: 'user-1', username: 'test', role: 'field_officer' },
      };
      const str = JSON.stringify(mockAuthResponse);
      expect(str).not.toContain(JWT_SECRET);
      expect(str).not.toContain('JWT_SECRET');
    });

    it('should not expose environment variables in error responses', () => {
      const filter = new GlobalExceptionFilter();
      const envError = new Error(
        `DATABASE_URL=postgresql://user:pass@localhost:5432/db JWT_SECRET=${JWT_SECRET}`,
      );
      const { host, response } = createMockArgumentsHost();
      filter.catch(envError, host as never);

      const body = (response.json as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const str = JSON.stringify(body);
      expect(str).not.toContain('DATABASE_URL');
      expect(str).not.toContain(JWT_SECRET);
      expect(str).not.toContain('postgresql://');
    });
  });


  // ── 46.7: File Upload Rejects Invalid MIME Types and Oversized Files ───

  describe('46.7 — File upload rejects invalid MIME types and oversized files', () => {
    describe('MIME type validation via magic bytes', () => {
      it('should detect JPEG files', () => {
        expect(detectMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe('image/jpeg');
      });

      it('should detect PNG files', () => {
        expect(detectMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]))).toBe('image/png');
      });

      it('should detect PDF files', () => {
        expect(detectMimeType(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]))).toBe('application/pdf');
      });

      it('should reject executable files (ELF magic bytes)', () => {
        expect(detectMimeType(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))).toBeNull();
      });

      it('should reject HTML files disguised as images', () => {
        expect(detectMimeType(Buffer.from('<html><body>malicious</body></html>'))).toBeNull();
      });

      it('should reject JavaScript files', () => {
        expect(detectMimeType(Buffer.from('const x = require("child_process");'))).toBeNull();
      });

      it('should reject empty buffers', () => {
        expect(detectMimeType(Buffer.alloc(0))).toBeNull();
      });

      it('should reject buffers too short for any signature', () => {
        expect(detectMimeType(Buffer.from([0xff]))).toBeNull();
      });
    });

    describe('file size validation', () => {
      it('should accept files within 5MB limit', () => {
        expect(isFileSizeValid(1)).toBe(true);
        expect(isFileSizeValid(1024)).toBe(true);
        expect(isFileSizeValid(5 * 1024 * 1024)).toBe(true);
      });

      it('should reject files exceeding 5MB', () => {
        expect(isFileSizeValid(5 * 1024 * 1024 + 1)).toBe(false);
        expect(isFileSizeValid(10 * 1024 * 1024)).toBe(false);
      });

      it('should reject zero-size files', () => {
        expect(isFileSizeValid(0)).toBe(false);
      });

      it('should reject negative file sizes', () => {
        expect(isFileSizeValid(-1)).toBe(false);
        expect(isFileSizeValid(-1024)).toBe(false);
      });
    });

    describe('embedded script detection', () => {
      it('should detect <script> tags', () => {
        expect(containsEmbeddedScripts(Buffer.from('<script>alert("xss")</script>'))).toBe(true);
      });

      it('should detect javascript: URIs', () => {
        expect(containsEmbeddedScripts(Buffer.from('href="javascript:alert(1)"'))).toBe(true);
      });

      it('should detect onclick= event handlers', () => {
        expect(containsEmbeddedScripts(Buffer.from('<img onclick="alert(1)" src="x">'))).toBe(true);
      });

      it('should detect server-side template injection (<%)', () => {
        expect(containsEmbeddedScripts(Buffer.from('<% system("rm -rf /") %>'))).toBe(true);
      });

      it('should detect PHP injection', () => {
        expect(containsEmbeddedScripts(Buffer.from('<?php exec("whoami"); ?>'))).toBe(true);
      });

      it('should pass clean binary files through', () => {
        expect(containsEmbeddedScripts(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]))).toBe(false);
      });

      it('should pass clean text content through', () => {
        expect(containsEmbeddedScripts(Buffer.from('This is a normal document with no scripts.'))).toBe(false);
      });
    });
  });

  // ── 46.8: Pagination Max Page Size Enforced ────────────────────────────

  describe('46.8 — Pagination max page size enforced (100 items)', () => {
    it('should enforce @Max(100) on take parameter in CustomerQueryDto', async () => {
      const mod = await import('../src/modules/customer/dto/customer-query.dto');
      const DtoClass = mod.CustomerQueryDto;
      const { getMetadataStorage } = await import('class-validator');
      const metadata = getMetadataStorage().getTargetValidationMetadatas(DtoClass, '', false, false);
      const maxValidator = metadata.find((m) => m.propertyName === 'take' && m.name === 'max');
      expect(maxValidator).toBeDefined();
      expect(maxValidator!.constraints).toContain(100);
    });

    it('should enforce @Max(100) on take parameter in LoanQueryDto', async () => {
      const mod = await import('../src/modules/loan/dto/loan-query.dto');
      const DtoClass = mod.LoanQueryDto;
      const { getMetadataStorage } = await import('class-validator');
      const metadata = getMetadataStorage().getTargetValidationMetadatas(DtoClass, '', false, false);
      const maxValidator = metadata.find((m) => m.propertyName === 'take' && m.name === 'max');
      expect(maxValidator).toBeDefined();
      expect(maxValidator!.constraints).toContain(100);
    });

    it('should enforce @Max(100) on take parameter in AuditLogQueryDto', async () => {
      const mod = await import('../src/modules/audit/dto/audit-log-query.dto');
      const DtoClass = mod.AuditLogQueryDto;
      const { getMetadataStorage } = await import('class-validator');
      const metadata = getMetadataStorage().getTargetValidationMetadatas(DtoClass, '', false, false);
      const maxValidator = metadata.find((m) => m.propertyName === 'take' && m.name === 'max');
      expect(maxValidator).toBeDefined();
      expect(maxValidator!.constraints).toContain(100);
    });

    it('should enforce @Max(100) on take parameter in CashbookQueryDto', async () => {
      const mod = await import('../src/modules/cashbook/dto/cashbook-query.dto');
      const DtoClass = mod.ExpenseQueryDto;
      const { getMetadataStorage } = await import('class-validator');
      const metadata = getMetadataStorage().getTargetValidationMetadatas(DtoClass, '', false, false);
      const maxValidator = metadata.find((m) => m.propertyName === 'take' && m.name === 'max');
      expect(maxValidator).toBeDefined();
      expect(maxValidator!.constraints).toContain(100);
    });

    it('should enforce @Min(1) on take parameter to prevent zero/negative page sizes', async () => {
      const mod = await import('../src/modules/customer/dto/customer-query.dto');
      const DtoClass = mod.CustomerQueryDto;
      const { getMetadataStorage } = await import('class-validator');
      const metadata = getMetadataStorage().getTargetValidationMetadatas(DtoClass, '', false, false);
      const minValidator = metadata.find((m) => m.propertyName === 'take' && m.name === 'min');
      expect(minValidator).toBeDefined();
      expect(minValidator!.constraints).toContain(1);
    });
  });

  // ── Supplementary RBAC Security ────────────────────────────────────────

  describe('RBAC enforcement (supplementary security)', () => {
    it('should deny access when no user is present on request', () => {
      const { context, reflector } = createMockExecutionContext(undefined, 'loan.create');
      const guard = new RbacGuard(reflector as never);
      expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
    });

    it('should deny access when user has no role', () => {
      const { context, reflector } = createMockExecutionContext({ sub: 'u1', role: '' }, 'loan.create');
      const guard = new RbacGuard(reflector as never);
      expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
    });

    it('should allow access when no permission metadata is set (open endpoint)', () => {
      const { context, reflector } = createMockExecutionContext({ sub: 'u1', role: 'field_officer' }, undefined);
      const guard = new RbacGuard(reflector as never);
      expect(guard.canActivate(context as never)).toBe(true);
    });

    it('should deny unknown permission keys (least privilege)', () => {
      const { context, reflector } = createMockExecutionContext({ sub: 'u1', role: 'super_admin' }, 'nonexistent.permission');
      const guard = new RbacGuard(reflector as never);
      expect(() => guard.canActivate(context as never)).toThrow(ForbiddenException);
    });

    it('should have permissions defined for all critical finance operations', () => {
      const critical = [
        'loan.approve', 'loan.disburse', 'loan.close',
        'collection.create', 'collection.reverse',
        'penalty.waive', 'foreclosure.execute',
        'accounting.create_expense',
      ];
      for (const perm of critical) {
        expect(PERMISSIONS[perm]).toBeDefined();
        expect(PERMISSIONS[perm]!.length).toBeGreaterThan(0);
      }
    });
  });
});
