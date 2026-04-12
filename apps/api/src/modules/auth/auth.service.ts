import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import {
  BusinessRuleError,
  AuthorizationError,
} from '../../common/errors';

// Use lower bcrypt cost in test/dev for faster hashing (still secure enough for tests)
const BCRYPT_COST = process.env['BCRYPT_COST'] ? parseInt(process.env['BCRYPT_COST'], 10) : 12;
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const REFRESH_TOKEN_DAYS = 7;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; fullName: string; role: string };
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; username: string; fullName: string; role: string };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const user = await this.prisma['users'].findUnique({
      where: { username: dto.username },
    });

    if (!user || !user.is_active) {
      throw new AuthorizationError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Check account lockout
    if (user.locked_until && user.locked_until > new Date()) {
      throw new BusinessRuleError(
        'Account is locked. Try again later.',
        'ACCOUNT_LOCKED',
      );
    }

    // Compare password
    const passwordValid = await bcrypt.compare(dto.password, user.password_hash);

    if (!passwordValid) {
      await this.handleFailedLogin(user.id, user.failed_login_attempts);
      throw new AuthorizationError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Reset failed attempts on successful login
    await this.prisma['users'].update({
      where: { id: user.id },
      data: {
        failed_login_attempts: 0,
        locked_until: null,
        last_login_at: new Date(),
      },
    });

    const accessToken = this.issueAccessToken(user.id, user.role);
    const refreshToken = await this.createRefreshToken(user.id);

    await this.logAuditEvent(user.id, user.role, 'login_success', 'users', user.id);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role,
      },
    };
  }

  async refreshToken(currentRefreshToken: string): Promise<RefreshResult> {
    // Extract selector (first 32 hex chars = 16 bytes) for O(1) lookup
    const selector = currentRefreshToken.slice(0, 32);
    const validator = currentRefreshToken.slice(32);

    // Find token by selector (indexed lookup)
    const token = await this.prisma['refresh_tokens'].findFirst({
      where: {
        token_selector: selector,
        is_revoked: false,
        expires_at: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!token) {
      throw new AuthorizationError(
        'Invalid or expired refresh token',
        'INVALID_REFRESH_TOKEN',
      );
    }

    // Verify the validator portion against the hash
    const isValid = await bcrypt.compare(validator, token.token_hash);
    if (!isValid) {
      throw new AuthorizationError(
        'Invalid or expired refresh token',
        'INVALID_REFRESH_TOKEN',
      );
    }

    const matchedToken = token;

    if (!matchedToken.user.is_active) {
      throw new AuthorizationError('Account is inactive', 'ACCOUNT_INACTIVE');
    }

    // Revoke old refresh token (rotation) - skip in test environment for reusable storage state
    if (process.env['SKIP_TOKEN_ROTATION'] !== 'true') {
      await this.prisma['refresh_tokens'].update({
        where: { id: matchedToken.id },
        data: { is_revoked: true },
      });
    }

    const accessToken = this.issueAccessToken(
      matchedToken.user.id,
      matchedToken.user.role,
    );
    const newRefreshToken = await this.createRefreshToken(matchedToken.user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: matchedToken.user.id,
        username: matchedToken.user.username,
        fullName: matchedToken.user.full_name,
        role: matchedToken.user.role,
      },
    };
  }

  async logout(userId: string): Promise<void> {
    await this.prisma['refresh_tokens'].updateMany({
      where: { user_id: userId, is_revoked: false },
      data: { is_revoked: true },
    });

    await this.logAuditEvent(userId, undefined, 'logout', 'users', userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma['users'].findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new AuthorizationError('User not found', 'USER_NOT_FOUND');
    }

    const currentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password_hash,
    );

    if (!currentPasswordValid) {
      throw new AuthorizationError(
        'Current password is incorrect',
        'INVALID_CURRENT_PASSWORD',
      );
    }

    // Hash new password with bcrypt cost 12+
    const newPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);

    // Update password and revoke all refresh tokens (invalidate all sessions)
    await this.prisma['$transaction']([
      this.prisma['users'].update({
        where: { id: userId },
        data: { password_hash: newPasswordHash },
      }),
      this.prisma['refresh_tokens'].updateMany({
        where: { user_id: userId, is_revoked: false },
        data: { is_revoked: true },
      }),
    ]);

    await this.logAuditEvent(
      userId,
      user.role,
      'password_changed',
      'users',
      userId,
    );
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  private issueAccessToken(userId: string, role: string): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const expiry = process.env['JWT_EXPIRY'] || '15m';

    return jwt.sign(
      { sub: userId, role } as jwt.JwtPayload,
      secret as jwt.Secret,
      { expiresIn: expiry } as jwt.SignOptions,
    );
  }

  private async createRefreshToken(userId: string): Promise<string> {
    // Generate 64 bytes: first 16 for selector (stored plaintext), remaining 48 for validator (hashed)
    const selectorBytes = crypto.randomBytes(16);
    const validatorBytes = crypto.randomBytes(48);

    const selector = selectorBytes.toString('hex'); // 32 hex chars
    const validator = validatorBytes.toString('hex'); // 96 hex chars
    const rawToken = selector + validator; // 128 hex chars total

    // Only hash the validator portion (not the selector)
    const validatorHash = await bcrypt.hash(validator, BCRYPT_COST);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_DAYS);

    await this.prisma['refresh_tokens'].create({
      data: {
        user_id: userId,
        token_selector: selector,
        token_hash: validatorHash,
        expires_at: expiresAt,
      },
    });

    return rawToken;
  }

  private async handleFailedLogin(
    userId: string,
    currentAttempts: number,
  ): Promise<void> {
    const newAttempts = currentAttempts + 1;

    const updateData: {
      failed_login_attempts: number;
      locked_until?: Date;
    } = {
      failed_login_attempts: newAttempts,
    };

    if (newAttempts >= MAX_FAILED_ATTEMPTS) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + LOCKOUT_MINUTES);
      updateData.locked_until = lockUntil;

      this.logger.warn({
        msg: 'Account locked due to failed login attempts',
        userId,
        attempts: newAttempts,
        lockedUntil: lockUntil.toISOString(),
      });

      await this.logAuditEvent(userId, undefined, 'account_locked', 'users', userId);
    }

    await this.logAuditEvent(userId, undefined, 'login_failed', 'users', userId);

    await this.prisma['users'].update({
      where: { id: userId },
      data: updateData,
    });
  }

  private async logAuditEvent(
    actorId: string,
    actorRole: string | undefined,
    actionType: string,
    targetEntity: string,
    targetId: string,
  ): Promise<void> {
    try {
      await this.prisma['audit_logs'].create({
        data: {
          action_type: actionType as never,
          actor_id: actorId,
          actor_role: (actorRole ?? 'viewer_auditor') as never,
          target_entity: targetEntity,
          target_id: targetId,
          ip_address: '0.0.0.0',
          request_id: '00000000-0000-0000-0000-000000000000',
        },
      });
    } catch (error) {
      // Audit logging should not break auth flow
      this.logger.error({ msg: 'Failed to create audit log', error });
    }
  }
}
