import { Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthorizationError, BusinessRuleError, UnauthorizedError } from '../../common/errors';

// Use lower bcrypt cost in test/dev for faster hashing (still secure enough for tests)
const BCRYPT_COST = process.env['BCRYPT_COST'] ? parseInt(process.env['BCRYPT_COST'], 10) : 12;
const REFRESH_TOKEN_DAYS = 7;
const PASSWORD_HISTORY_DEPTH = 5;

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
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
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
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
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
    const selector = currentRefreshToken.slice(0, 32);
    const validator = currentRefreshToken.slice(32);

    // Look up by selector regardless of is_revoked — we need to detect replay
    // of revoked tokens (which signals token theft) and revoke the whole family.
    const token = await this.prisma['refresh_tokens'].findFirst({
      where: {
        token_selector: selector,
        expires_at: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!token) {
      throw new UnauthorizedError(
        'Invalid or expired refresh token',
        'INVALID_REFRESH_TOKEN',
      );
    }

    // Verify the validator portion against the hash before any side effect
    const isValid = await bcrypt.compare(validator, token.token_hash);
    if (!isValid) {
      throw new UnauthorizedError(
        'Invalid or expired refresh token',
        'INVALID_REFRESH_TOKEN',
      );
    }

    // REPLAY DETECTION: a revoked token presented again means someone has
    // a stolen copy. Revoke the entire family + bump token_version to kill
    // any access tokens already issued in this chain.
    if (token.is_revoked) {
      await this.revokeFamily(token.family_id, 'replay_detected');
      await this.prisma['users'].update({
        where: { id: token.user_id },
        data: { token_version: { increment: 1 } },
      });
      await this.logAuditEvent(
        token.user_id,
        token.user.role,
        'refresh_token_replay_detected',
        'refresh_tokens',
        token.id,
      );
      throw new UnauthorizedError(
        'Refresh token replay detected. All sessions revoked.',
        'REFRESH_TOKEN_REPLAY',
      );
    }

    const matchedToken = token;

    if (!matchedToken.user.is_active) {
      throw new UnauthorizedError('Account is inactive', 'ACCOUNT_INACTIVE');
    }

    // Revoke old refresh token (rotation). SKIP_TOKEN_ROTATION=true is for
    // dev/test storage-state reuse only — env validation forbids it in prod.
    if (process.env['SKIP_TOKEN_ROTATION'] !== 'true') {
      await this.prisma['refresh_tokens'].update({
        where: { id: matchedToken.id },
        data: {
          is_revoked: true,
          revoked_at: new Date(),
          revoked_reason: 'rotated',
        },
      });
    }

    const accessToken = this.issueAccessToken(
      matchedToken.user.id,
      matchedToken.user.role,
      matchedToken.user.token_version,
    );
    const newRefreshToken = await this.createRefreshToken(
      matchedToken.user.id,
      matchedToken.family_id,
      matchedToken.id,
    );

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

    // Reject re-use of current password
    if (dto.newPassword === dto.currentPassword) {
      throw new BusinessRuleError(
        'New password must differ from the current password',
        'PASSWORD_REUSE',
      );
    }

    // Check against the last N historical passwords (audit: no password history)
    const history = await this.prisma['password_history'].findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      take: PASSWORD_HISTORY_DEPTH,
      select: { password_hash: true },
    });
    for (const h of history) {
      if (await bcrypt.compare(dto.newPassword, h.password_hash)) {
        throw new BusinessRuleError(
          `New password matches one of your last ${PASSWORD_HISTORY_DEPTH} passwords. Choose a different one.`,
          'PASSWORD_REUSE',
        );
      }
    }
    // Current password is also reuse — check it too
    if (await bcrypt.compare(dto.newPassword, user.password_hash)) {
      throw new BusinessRuleError(
        'New password must differ from the current password',
        'PASSWORD_REUSE',
      );
    }

    // Hash new password with bcrypt cost 12+
    const newPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_COST);

    // Update password, archive the OLD hash into history, bump token_version,
    // and revoke all refresh tokens — atomic.
    await this.prisma['$transaction']([
      this.prisma['password_history'].create({
        data: {
          user_id: userId,
          password_hash: user.password_hash,
        },
      }),
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

  private async createRefreshToken(
    userId: string,
    familyId?: string,
    parentId?: string,
  ): Promise<string> {
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
        // Initial login: omit (DB default generates a new family_id, parent_id NULL)
        // Rotation: pass through the existing familyId + the parent rotated from
        ...(familyId ? { family_id: familyId } : {}),
        ...(parentId ? { parent_id: parentId } : {}),
      },
    });

    return rawToken;
  }

  /**
   * Revoke every non-revoked token in a refresh-token family at once.
   * Called when token replay is detected — all chains derived from a stolen
   * token get killed simultaneously.
   */
  private async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma['refresh_tokens'].updateMany({
      where: { family_id: familyId, is_revoked: false },
      data: {
        is_revoked: true,
        revoked_at: new Date(),
        revoked_reason: reason,
      },
    });
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
