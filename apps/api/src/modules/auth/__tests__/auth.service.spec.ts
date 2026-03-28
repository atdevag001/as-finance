import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { AuthService } from '../auth.service';
import { AuthorizationError, BusinessRuleError } from '../../../common/errors';

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(),
}));

// Mock crypto
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => ({
    toString: () => 'mock-refresh-token-hex',
  })),
}));

const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
const mockUser = {
  id: mockUserId,
  username: 'testuser',
  password_hash: '$2a$12$hashedpassword',
  full_name: 'Test User',
  role: 'manager',
  is_active: true,
  failed_login_attempts: 0,
  locked_until: null,
  last_login_at: null,
  email: null,
  mobile: '9876543210',
  version: 1,
  created_at: new Date(),
  updated_at: new Date(),
};

function createMockPrisma() {
  return {
    users: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refresh_tokens: {
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    audit_logs: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env['JWT_SECRET'] = 'test-secret-key';
    process.env['JWT_EXPIRY'] = '15m';

    mockPrisma = createMockPrisma();
    service = new AuthService(mockPrisma as never);
  });

  describe('login', () => {
    it('should return access token and user on valid credentials', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-refresh');
      (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue('mock-access-token');
      mockPrisma.users.update.mockResolvedValue(mockUser);
      mockPrisma.refresh_tokens.create.mockResolvedValue({});
      mockPrisma.audit_logs.create.mockResolvedValue({});

      const result = await service.login({
        username: 'testuser',
        password: 'ValidPass1',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.user.id).toBe(mockUserId);
      expect(result.user.username).toBe('testuser');
      expect(result.user.fullName).toBe('Test User');
      expect(result.user.role).toBe('manager');
      expect(result.refreshToken).toBe('mock-refresh-token-hex');

      // Verify failed attempts were reset
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failed_login_attempts: 0,
            locked_until: null,
          }),
        }),
      );
    });

    it('should throw AuthorizationError for non-existent user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ username: 'nouser', password: 'pass' }),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError for inactive user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        ...mockUser,
        is_active: false,
      });

      await expect(
        service.login({ username: 'testuser', password: 'pass' }),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw BusinessRuleError for locked account', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 10);

      mockPrisma.users.findUnique.mockResolvedValue({
        ...mockUser,
        locked_until: futureDate,
      });

      await expect(
        service.login({ username: 'testuser', password: 'pass' }),
      ).rejects.toThrow(BusinessRuleError);
    });

    it('should increment failed attempts on wrong password', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      mockPrisma.users.update.mockResolvedValue(mockUser);
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await expect(
        service.login({ username: 'testuser', password: 'wrong' }),
      ).rejects.toThrow(AuthorizationError);

      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failed_login_attempts: 1,
          }),
        }),
      );
    });

    it('should lock account after 5 failed attempts', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        ...mockUser,
        failed_login_attempts: 4,
      });
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      mockPrisma.users.update.mockResolvedValue(mockUser);
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await expect(
        service.login({ username: 'testuser', password: 'wrong' }),
      ).rejects.toThrow(AuthorizationError);

      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failed_login_attempts: 5,
            locked_until: expect.any(Date),
          }),
        }),
      );

      // Verify lockout audit event was logged
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'account_locked',
          }),
        }),
      );
    });

    it('should allow login when lockout has expired', async () => {
      const pastDate = new Date();
      pastDate.setMinutes(pastDate.getMinutes() - 5);

      mockPrisma.users.findUnique.mockResolvedValue({
        ...mockUser,
        locked_until: pastDate,
        failed_login_attempts: 5,
      });
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-refresh');
      (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue('mock-access-token');
      mockPrisma.users.update.mockResolvedValue(mockUser);
      mockPrisma.refresh_tokens.create.mockResolvedValue({});
      mockPrisma.audit_logs.create.mockResolvedValue({});

      const result = await service.login({
        username: 'testuser',
        password: 'ValidPass1',
      });

      expect(result.accessToken).toBe('mock-access-token');
    });
  });

  describe('refreshToken', () => {
    it('should rotate refresh token and issue new access token', async () => {
      const mockTokenRecord = {
        id: 'token-id-1',
        user_id: mockUserId,
        token_hash: 'hashed-token',
        expires_at: new Date(Date.now() + 86400000),
        is_revoked: false,
        created_at: new Date(),
        user: mockUser,
      };

      mockPrisma.refresh_tokens.findMany.mockResolvedValue([mockTokenRecord]);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      mockPrisma.refresh_tokens.update.mockResolvedValue({});
      (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue('new-access-token');
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hashed-refresh');
      mockPrisma.refresh_tokens.create.mockResolvedValue({});

      const result = await service.refreshToken('valid-refresh-token');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token-hex');

      // Verify old token was revoked
      expect(mockPrisma.refresh_tokens.update).toHaveBeenCalledWith({
        where: { id: 'token-id-1' },
        data: { is_revoked: true },
      });

      // Verify new token was created
      expect(mockPrisma.refresh_tokens.create).toHaveBeenCalled();
    });

    it('should throw AuthorizationError for invalid refresh token', async () => {
      mockPrisma.refresh_tokens.findMany.mockResolvedValue([]);

      await expect(
        service.refreshToken('invalid-token'),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError for inactive user', async () => {
      const mockTokenRecord = {
        id: 'token-id-1',
        user_id: mockUserId,
        token_hash: 'hashed-token',
        expires_at: new Date(Date.now() + 86400000),
        is_revoked: false,
        created_at: new Date(),
        user: { ...mockUser, is_active: false },
      };

      mockPrisma.refresh_tokens.findMany.mockResolvedValue([mockTokenRecord]);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(
        service.refreshToken('valid-token'),
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('logout', () => {
    it('should revoke all refresh tokens for user', async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await service.logout(mockUserId);

      expect(mockPrisma.refresh_tokens.updateMany).toHaveBeenCalledWith({
        where: { user_id: mockUserId, is_revoked: false },
        data: { is_revoked: true },
      });
    });
  });

  describe('changePassword', () => {
    it('should change password and revoke all sessions', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hashed-password');
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await service.changePassword(mockUserId, {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
      });

      // Verify bcrypt hash was called with cost 12
      expect(bcrypt.hash).toHaveBeenCalledWith('NewPass1', 12);

      // Verify transaction was used
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('should throw AuthorizationError for wrong current password', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        service.changePassword(mockUserId, {
          currentPassword: 'WrongPass1',
          newPassword: 'NewPass1',
        }),
      ).rejects.toThrow(AuthorizationError);
    });

    it('should throw AuthorizationError for non-existent user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword(mockUserId, {
          currentPassword: 'OldPass1',
          newPassword: 'NewPass1',
        }),
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
