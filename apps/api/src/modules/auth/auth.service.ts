import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthorizationError, BusinessRuleError, UnauthorizedError } from '../../common/errors';
import { isCommonPassword } from '../../common/utils/common-passwords';

// Prisma's interactive-transaction client type — used so createRefreshToken can run inside $transaction.
type TxClient = Prisma.TransactionClient;

// Use lower bcrypt cost in test/dev for faster hashing (still secure enough for tests)
const BCRYPT_COST = process.env['BCRYPT_COST'] ? parseInt(process.env['BCRYPT_COST'], 10) : 12;
const REFRESH_TOKEN_DAYS = 7;
const PASSWORD_HISTORY_DEPTH = 5;
const PASSWORD_HISTORY_RETAIN = 10; // keep last N hashes per user (prune older)

/**
 * Fixed bcrypt hash used as a constant-time decoy when the username does not
 * exist or the account is inactive. Performing a bcrypt.compare against this
 * value equalizes timing so an attacker cannot enumerate valid usernames.
 * Cost factor 12 matches BCRYPT_COST. Hash value is irrelevant — it just has
 * to be a valid bcrypt string. Generated from the literal string "decoy".
 */
const DECOY_HASH =
  '$2a$12$CwTycUXWue0Thq9StjUM0uJ8.GYI8oBu3JxqMxXr9F6lvJqkTUvWy';

/** Optional request context passed by controllers for audit log fidelity. */
export interface AuthRequestContext {
  ipAddress: string;
  requestId: string;
}

const DEFAULT_CTX: AuthRequestContext = {
  ipAddress: '0.0.0.0',
  requestId: '00000000-0000-0000-0000-000000000000',
};

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

  async login(dto: LoginDto, ctx: AuthRequestContext = DEFAULT_CTX): Promise<LoginResult> {
    const user = await this.prisma['users'].findUnique({
      where: { username: dto.username },
    });

    if (!user?.is_active) {
      // Constant-time decoy: equalize timing so an attacker can't enumerate
      // valid usernames by measuring response time. We compare against a
      // fixed valid bcrypt hash so the bcrypt cost is paid either way.
      await bcrypt.compare(dto.password, DECOY_HASH);
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Lockout check BEFORE bcrypt — prevents timing-side-channel and credential stuffing.
    // Do NOT expose ACCOUNT_LOCKED to the client (avoids account enumeration);
    // return the same generic INVALID_CREDENTIALS code. Lock state is still
    // logged internally for ops/audit visibility.
    if (user.locked_until && user.locked_until > new Date()) {
      this.logger.warn({
        msg: 'Login attempt against locked account',
        userId: user.id,
        lockedUntil: user.locked_until.toISOString(),
        requestId: ctx.requestId,
      });
      // Pay the bcrypt cost so timing matches the success path.
      await bcrypt.compare(dto.password, DECOY_HASH);
      throw new UnauthorizedError('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    // Compare password
    const passwordValid = await bcrypt.compare(dto.password, user.password_hash);

    if (!passwordValid) {
      await this.handleFailedLogin(user.id, ctx);
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

    await this.logAuditEvent(user.id, user.role, 'login_success', 'users', user.id, ctx);

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

  async refreshToken(
    currentRefreshToken: string,
    ctx: AuthRequestContext = DEFAULT_CTX,
  ): Promise<RefreshResult> {
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
        ctx,
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

    // Atomic rotation: conditional updateMany + create inside a transaction so
    // two concurrent refreshes can't both pass the is_revoked=false check and
    // mint two live children. The first tx flips is_revoked; the second sees
    // count===0 and aborts. SKIP_TOKEN_ROTATION=true is for dev/test only.
    const skipRotation = process.env['SKIP_TOKEN_ROTATION'] === 'true';
    const newRefreshToken: string = await this.prisma.$transaction(
      async (tx: TxClient) => {
        if (!skipRotation) {
          const revoked = await tx['refresh_tokens'].updateMany({
            where: { id: matchedToken.id, is_revoked: false },
            data: {
              is_revoked: true,
              revoked_at: new Date(),
              revoked_reason: 'rotated',
            },
          });
          if (revoked.count === 0) {
            throw new UnauthorizedError(
              'Invalid or expired refresh token',
              'INVALID_REFRESH_TOKEN',
            );
          }
        }
        return this.createRefreshToken(
          matchedToken.user.id,
          matchedToken.family_id,
          matchedToken.id,
          tx,
        );
      },
    );

    const accessToken = this.issueAccessToken(
      matchedToken.user.id,
      matchedToken.user.role,
      matchedToken.user.token_version,
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

  async logout(userId: string, ctx: AuthRequestContext = DEFAULT_CTX): Promise<void> {
    await this.prisma['refresh_tokens'].updateMany({
      where: { user_id: userId, is_revoked: false },
      data: { is_revoked: true },
    });

    await this.logAuditEvent(userId, undefined, 'logout', 'users', userId, ctx);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ctx: AuthRequestContext = DEFAULT_CTX,
  ): Promise<void> {
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

    // Reject common/breached passwords (complexity is enforced by DTO validators).
    if (isCommonPassword(dto.newPassword)) {
      throw new BadRequestException({
        message:
          'This password appears in common breach lists. Choose a less predictable one.',
        code: 'COMMON_PASSWORD',
      });
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

    // Prune history beyond PASSWORD_HISTORY_RETAIN to prevent unbounded growth.
    // Fire-and-forget — pruning isn't part of the auth-critical path.
    void this.pruneOldPasswordHistory(userId);

    await this.logAuditEvent(
      userId,
      user.role,
      'password_changed',
      'users',
      userId,
      ctx,
    );
  }

  private async pruneOldPasswordHistory(userId: string): Promise<void> {
    try {
      const recent = await this.prisma['password_history'].findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        take: PASSWORD_HISTORY_RETAIN,
        select: { id: true },
      });
      if (recent.length < PASSWORD_HISTORY_RETAIN) return;
      const keepIds = recent.map((r) => r.id);
      await this.prisma['password_history'].deleteMany({
        where: { user_id: userId, id: { notIn: keepIds } },
      });
    } catch (err) {
      this.logger.warn({ msg: 'password_history pruning failed', userId, err });
    }
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
    client: PrismaService | TxClient = this.prisma,
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

    await client['refresh_tokens'].create({
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

  private async handleFailedLogin(
    userId: string,
    ctx: AuthRequestContext = DEFAULT_CTX,
  ): Promise<void> {
    // Atomically increment failed counter
    const updated = await this.prisma['users'].update({
      where: { id: userId },
      data: { failed_login_attempts: { increment: 1 } },
      select: { failed_login_attempts: true },
    });

    await this.logAuditEvent(userId, undefined, 'login_failed', 'users', userId, ctx);

    // Lock the account after 5 consecutive failed attempts
    if (updated.failed_login_attempts >= 5) {
      const lockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
      await this.prisma['users'].update({
        where: { id: userId },
        data: { locked_until: lockedUntil },
      });
      await this.logAuditEvent(userId, undefined, 'account_locked', 'users', userId, ctx);
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
    ctx: AuthRequestContext = DEFAULT_CTX,
  ): Promise<void> {
    try {
      await this.prisma['audit_logs'].create({
        data: {
          action_type: actionType as never,
          actor_id: actorId,
          actor_role: (actorRole ?? 'viewer_auditor') as never,
          target_entity: targetEntity,
          target_id: targetId,
          ip_address: ctx.ipAddress,
          request_id: ctx.requestId,
        },
      });
    } catch (error) {
      // Audit logging should not break auth flow
      this.logger.error({ msg: 'Failed to create audit log', error });
    }
  }
}
