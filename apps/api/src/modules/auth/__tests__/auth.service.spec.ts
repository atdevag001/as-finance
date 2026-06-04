import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { AuthService } from '../auth.service';
import { AuthorizationError, UnauthorizedError } from '../../../common/errors';

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  compare: vi.fn(),
  hash: vi.fn(),
}));

// Mock jsonwebtoken
vi.mock('jsonwebtoken', () => ({
  sign: vi.fn(),
}));

// Mock crypto — both randomBytes (for refresh tokens) and randomUUID (for JWT jti)
vi.mock('crypto', () => ({
  randomBytes: vi.fn(() => ({
    toString: () => 'mock-refresh-token-hex',
  })),
  randomUUID: vi.fn(() => 'mock-jwt-jti-uuid'),
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
  token_version: 1,
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
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    // Sprint password-history: changePassword now reads + appends history
    password_history: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
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

  // ─── login() ──────────────────────────────────────────────────────────

  describe('login', () => {
    /** Validates: Requirements 17.1 */
    it('should return access token, refresh token, and user data on valid credentials', async () => {
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
      // refresh token = selector + validator (both come from mocked randomBytes)
      expect(result.refreshToken).toBe('mock-refresh-token-hexmock-refresh-token-hex');
      expect(result.user).toEqual({
        id: mockUserId,
        username: 'testuser',
        fullName: 'Test User',
        role: 'manager',
      });

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

    /** Validates: Requirements 17.2 — wrong creds = 401 UnauthorizedError */
    it('should throw UnauthorizedError for non-existent user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ username: 'nouser', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedError);
    });

    /** Validates: Requirements 17.3 */
    it('should throw UnauthorizedError for invalid password', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      mockPrisma.users.update.mockResolvedValue({
        ...mockUser,
        failed_login_attempts: 1,
      });
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await expect(
        service.login({ username: 'testuser', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedError);

      // New behavior: handleFailedLogin uses atomic increment, not absolute value
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            failed_login_attempts: { increment: 1 },
          }),
        }),
      );
    });

    /** Validates: Requirements 17.4 */
    it('should lock account after 5 failed attempts', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        ...mockUser,
        failed_login_attempts: 4,
      });
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      // After increment, the row reads back failed_login_attempts=5
      mockPrisma.users.update.mockResolvedValue({
        ...mockUser,
        failed_login_attempts: 5,
      });
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await expect(
        service.login({ username: 'testuser', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedError);

      // New behavior: two updates — increment, then conditional lock
      const updateCalls = (mockPrisma.users.update as any).mock.calls;
      expect(updateCalls).toEqual(
        expect.arrayContaining([
          expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                failed_login_attempts: { increment: 1 },
              }),
            }),
          ]),
          expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                locked_until: expect.any(Date),
              }),
            }),
          ]),
        ]),
      );

      // Lockout audit event logged
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'account_locked',
          }),
        }),
      );
    });

    /**
     * Validates: Requirements 17.5 — locked account masked as generic
     * INVALID_CREDENTIALS (audit anti-enumeration). The client must NOT be
     * able to distinguish "locked" from "wrong password" by response code or
     * message; lock state is logged internally only.
     */
    it('should throw UnauthorizedError (masked as invalid credentials) for locked account', async () => {
      const futureDate = new Date();
      futureDate.setMinutes(futureDate.getMinutes() + 10);

      mockPrisma.users.findUnique.mockResolvedValue({
        ...mockUser,
        locked_until: futureDate,
      });
      // Decoy bcrypt compare is invoked to equalize timing — return false.
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        service.login({ username: 'testuser', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedError);
    });

    /** Validates: Requirements 17.5 */
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

    /** Validates: Requirements 17.6 — inactive user blocked at login */
    it('should throw UnauthorizedError for inactive user', async () => {
      mockPrisma.users.findUnique.mockResolvedValue({
        ...mockUser,
        is_active: false,
      });

      await expect(
        service.login({ username: 'testuser', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedError);
    });

    /** Validates: Requirements 17.13 */
    it('should create audit log on successful login', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('hashed-refresh');
      (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue('mock-access-token');
      mockPrisma.users.update.mockResolvedValue(mockUser);
      mockPrisma.refresh_tokens.create.mockResolvedValue({});
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await service.login({ username: 'testuser', password: 'ValidPass1' });

      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'login_success',
            actor_id: mockUserId,
            target_entity: 'users',
            target_id: mockUserId,
          }),
        }),
      );
    });

    /** Validates: Requirements 17.13 */
    it('should create audit log on failed login', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      mockPrisma.users.update.mockResolvedValue({
        ...mockUser,
        failed_login_attempts: 1,
      });
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await expect(
        service.login({ username: 'testuser', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedError);

      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'login_failed',
            actor_id: mockUserId,
            target_entity: 'users',
          }),
        }),
      );
    });
  });

  // ─── refreshToken() ───────────────────────────────────────────────────

  describe('refreshToken', () => {
    const validTokenRecord = {
      id: 'token-id-1',
      user_id: mockUserId,
      token_hash: 'hashed-token',
      expires_at: new Date(Date.now() + 86400000), // +24h
      is_revoked: false,
      created_at: new Date(),
      user: mockUser,
    };

    /** Validates: Requirements 17.7 */
    it('should rotate refresh token and issue new access token', async () => {
      // New token record shape includes family_id + parent_id
      const tokenWithFamily = {
        ...validTokenRecord,
        family_id: 'family-1',
        parent_id: null,
      };
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue(tokenWithFamily);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      mockPrisma.refresh_tokens.update.mockResolvedValue({});
      (jwt.sign as ReturnType<typeof vi.fn>).mockReturnValue('new-access-token');
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hashed-refresh');
      mockPrisma.refresh_tokens.create.mockResolvedValue({});

      const result = await service.refreshToken('valid-refresh-token-with-32-char-selector-prefix');

      expect(result.accessToken).toBe('new-access-token');
      // refresh token = selector + validator (both come from mocked randomBytes)
      expect(result.refreshToken).toBe('mock-refresh-token-hexmock-refresh-token-hex');

      // Old token revoked with reason='rotated' (Sprint family revocation)
      expect(mockPrisma.refresh_tokens.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-id-1' },
          data: expect.objectContaining({
            is_revoked: true,
            revoked_reason: 'rotated',
          }),
        }),
      );

      // New token created in same family, parent = old token
      expect(mockPrisma.refresh_tokens.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            family_id: 'family-1',
            parent_id: 'token-id-1',
          }),
        }),
      );
    });

    /** Validates: Requirements 17.8 */
    it('should throw UnauthorizedError when no matching token found', async () => {
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue(null);

      await expect(
        service.refreshToken('nonexistent-token-with-selector-prefix-here'),
      ).rejects.toThrow(UnauthorizedError);
    });

    /** Validates: Requirements 17.8 */
    it('should throw UnauthorizedError when token hash does not match', async () => {
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue({
        ...validTokenRecord,
        family_id: 'family-1',
        parent_id: null,
      });
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(
        service.refreshToken('wrong-token-with-selector-prefix-32-chr'),
      ).rejects.toThrow(UnauthorizedError);
    });

    /** Validates: Requirements 17.9 — expired tokens excluded by findFirst clause */
    it('should throw UnauthorizedError for expired refresh token', async () => {
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue(null);

      await expect(
        service.refreshToken('expired-token-with-selector-prefix-here'),
      ).rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError for inactive user on refresh', async () => {
      const inactiveUserToken = {
        ...validTokenRecord,
        family_id: 'family-1',
        parent_id: null,
        is_revoked: false,
        user: { ...mockUser, is_active: false },
      };

      mockPrisma.refresh_tokens.findFirst.mockResolvedValue(inactiveUserToken);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(
        service.refreshToken('valid-token-with-selector-prefix-32-chr'),
      ).rejects.toThrow(UnauthorizedError);
    });

    /** Sprint family-revocation: replayed revoked token revokes entire family + bumps tv */
    it('should revoke entire family and bump token_version on replay detection', async () => {
      const revokedToken = {
        ...validTokenRecord,
        is_revoked: true,
        family_id: 'family-x',
      };
      mockPrisma.refresh_tokens.findFirst.mockResolvedValue(revokedToken);
      (bcrypt.compare as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 3 });
      mockPrisma.users.update.mockResolvedValue(mockUser);
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await expect(
        service.refreshToken('replayed-token-with-selector-prefix-here'),
      ).rejects.toThrow(UnauthorizedError);

      // Family revoked
      expect(mockPrisma.refresh_tokens.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { family_id: 'family-x', is_revoked: false },
        }),
      );

      // token_version bumped — kills all access tokens in flight
      expect(mockPrisma.users.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { token_version: { increment: 1 } },
        }),
      );

      // Replay event audited
      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'refresh_token_replay_detected',
          }),
        }),
      );
    });
  });

  // ─── logout() ─────────────────────────────────────────────────────────

  describe('logout', () => {
    /** Validates: Requirements 17.10 */
    it('should revoke all refresh tokens for user', async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 2 });
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await service.logout(mockUserId);

      expect(mockPrisma.refresh_tokens.updateMany).toHaveBeenCalledWith({
        where: { user_id: mockUserId, is_revoked: false },
        data: { is_revoked: true },
      });
    });

    /** Validates: Requirements 17.13 */
    it('should create audit log on logout', async () => {
      mockPrisma.refresh_tokens.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await service.logout(mockUserId);

      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'logout',
            actor_id: mockUserId,
            target_entity: 'users',
            target_id: mockUserId,
          }),
        }),
      );
    });
  });

  // ─── changePassword() ─────────────────────────────────────────────────

  describe('changePassword', () => {
    /** Validates: Requirements 17.11 */
    it('should change password and revoke all sessions', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      // First bcrypt.compare = current-password check (must be true).
      // Subsequent compares are reuse-check against history + current — return
      // false so the new password is accepted.
      (bcrypt.compare as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(true)
        .mockResolvedValue(false);
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hashed-password');
      mockPrisma.$transaction.mockResolvedValue([{}, {}, {}]);
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await service.changePassword(mockUserId, {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
      });

      // Verify bcrypt hash was called with the configured cost (default 12, test env lower)
      expect(bcrypt.hash).toHaveBeenCalledWith(
        'NewPass1',
        expect.any(Number),
      );

      // Verify transaction was used for atomic password update + session invalidation
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    /** Validates: Requirements 17.12 */
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

    /** Validates: Requirements 17.13 */
    it('should create audit log on password change', async () => {
      mockPrisma.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(true)  // current-password verification
        .mockResolvedValue(false);    // reuse checks all return false
      (bcrypt.hash as ReturnType<typeof vi.fn>).mockResolvedValue('new-hashed-password');
      mockPrisma.$transaction.mockResolvedValue([{}, {}, {}]);
      mockPrisma.audit_logs.create.mockResolvedValue({});

      await service.changePassword(mockUserId, {
        currentPassword: 'OldPass1',
        newPassword: 'NewPass1',
      });

      expect(mockPrisma.audit_logs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action_type: 'password_changed',
            actor_id: mockUserId,
            target_entity: 'users',
            target_id: mockUserId,
          }),
        }),
      );
    });
  });
});
