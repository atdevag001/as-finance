import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthorizationError } from '../../common/errors';

// Use lower bcrypt cost in test/dev for faster hashing (still secure enough for tests)
const BCRYPT_COST = process.env['BCRYPT_COST'] ? parseInt(process.env['BCRYPT_COST'], 10) : 12;
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

    // Lockout check BEFORE bcrypt — prevents timing-side-channel and credential stuffing
    if (user.locked_until && user.locked_until > new Date()) {
      const minutes = Math.ceil(
        (user.locked_until.getTime() - Date.now()) / 60_000,
      );
      throw new AuthorizationError(
        `Account locked due to too many failed login attempts. Try again in ${minutes} minute(s).`,
        'ACCOUNT_LOCKED',
      );
    }

    // Compare password
    const passwordValid = await bcrypt.compare(dto.password, user.password_hash);

    if (!passwordValid) {
      await this.handleFailedLogin(user.id);
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

    const accessToken = this.issueAccessToken(user.id, user.role, user.token_version);
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
      matchedToken.user.token_version,
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

    // Update password, bump token_version (invalidates all outstanding access tokens),
    // and revoke all refresh tokens — fully kills existing sessions.
    await this.prisma['$transaction']([
      this.prisma['users'].update({
        where: { id: userId },
        data: {
          password_hash: newPasswordHash,
          token_version: { increment: 1 },
        },
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

  private issueAccessToken(userId: string, role: string, tokenVersion: number): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }

    const expiry = process.env['JWT_EXPIRY'] || '15m';

    return jwt.sign(
      { sub: userId, role, tv: tokenVersion } as jwt.JwtPayload,
      secret as jwt.Secret,
      {
        expiresIn: expiry,
        algorithm: 'HS256',
        issuer: 'as-finance-api',
        audience: 'as-finance-web',
        jwtid: crypto.randomUUID(),
      } as jwt.SignOptions,
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

  private async handleFailedLogin(userId: string): Promise<void> {
    // Atomically increment failed counter
    const updated = await this.prisma['users'].update({
      where: { id: userId },
      data: { failed_login_attempts: { increment: 1 } },
      select: { failed_login_attempts: true },
    });

    await this.logAuditEvent(userId, undefined, 'login_failed', 'users', userId);

    // Lock the account after 5 consecutive failed attempts
    if (updated.failed_login_attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await this.prisma['users'].update({
        where: { id: userId },
        data: { locked_until: lockedUntil },
      });
      await this.logAuditEvent(userId, undefined, 'account_locked', 'users', userId);
      this.logger.warn({
        msg: 'Account locked after 5 failed login attempts',
        userId,
        lockedUntil: lockedUntil.toISOString(),
      });
    }
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
