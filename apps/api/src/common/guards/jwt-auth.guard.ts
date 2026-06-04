import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';
import { PrismaService } from '../../database/prisma.service';

export const IS_PUBLIC_KEY = 'isPublic';

export interface JwtPayload {
  sub: string;
  role: string;
  tv?: number; // token_version — bumped on password change to invalidate old tokens
  iat: number;
  exp: number;
}

// In-memory cache to avoid per-request DB hit for user freshness check.
// TTL keeps the window of admitted-but-deactivated tokens short.
// Hard size cap prevents memory leak — evicts oldest entries (FIFO) when full.
type UserCacheEntry = { role: string; is_active: boolean; token_version: number; expiresAt: number };
const USER_CACHE = new Map<string, UserCacheEntry>();
const USER_CACHE_TTL_MS = 5_000; // 5 seconds — short window for revoked/role-changed admittance
const USER_CACHE_MAX_SIZE = 10_000;

function evictOldestIfFull() {
  if (USER_CACHE.size < USER_CACHE_MAX_SIZE) return;
  // Map preserves insertion order; first key is oldest. Drop ~10% to amortize.
  const dropCount = Math.max(1, Math.floor(USER_CACHE_MAX_SIZE * 0.1));
  let dropped = 0;
  for (const key of USER_CACHE.keys()) {
    if (dropped >= dropCount) break;
    USER_CACHE.delete(key);
    dropped += 1;
  }
}

/**
 * Extracts and verifies the JWT from the access_token cookie OR
 * `Authorization: Bearer <token>` header. Attaches the decoded payload to
 * `request.user`. Endpoints decorated with `@SetMetadata('isPublic', true)`
 * skip verification.
 *
 * Re-validates the user from DB on a 60s TTL — terminated/role-changed
 * users lose access within 1 minute regardless of remaining JWT lifetime.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing or malformed authorization header');
    }

    const secret = process.env['JWT_SECRET'];
    if (!secret) {
      throw new UnauthorizedException('JWT configuration error');
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
        issuer: 'as-finance-api',
        audience: 'as-finance-web',
      }) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Re-check user against DB (cached) — rejects deactivated users,
    // role-changed users, and password-revoked tokens (token_version mismatch).
    const fresh = await this.getUserFreshness(payload.sub);
    if (!fresh.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }
    // Fail-closed token-version check: a missing or non-numeric `tv` claim
    // means the token was minted before tv enforcement (or by an attacker
    // crafting a payload). Either way, reject it — clients must re-login.
    if (typeof payload.tv !== 'number' || Number.isNaN(payload.tv)) {
      throw new UnauthorizedException({
        message: 'Token revoked',
        code: 'TOKEN_REVOKED',
      });
    }
    if (payload.tv !== fresh.token_version) {
      throw new UnauthorizedException({
        message: 'Token revoked by password change',
        code: 'TOKEN_REVOKED',
      });
    }
    // Trust the DB role over the JWT claim (handles role changes mid-session)
    payload.role = fresh.role;

    (request as Request & { user: JwtPayload }).user = payload;
    return true;
  }

  private async getUserFreshness(
    userId: string,
  ): Promise<{ role: string; is_active: boolean; token_version: number }> {
    const cached = USER_CACHE.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        role: cached.role,
        is_active: cached.is_active,
        token_version: cached.token_version,
      };
    }
    const user = await this.prisma['users'].findUnique({
      where: { id: userId },
      select: { role: true, is_active: true, token_version: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    evictOldestIfFull();
    USER_CACHE.set(userId, {
      role: user.role,
      is_active: user.is_active,
      token_version: user.token_version,
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    });
    return {
      role: user.role,
      is_active: user.is_active,
      token_version: user.token_version,
    };
  }

  private extractToken(request: Request): string | undefined {
    const cookieToken = (request as Request & { cookies?: Record<string, string> })
      .cookies?.['access_token'];
    if (cookieToken) return cookieToken;

    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return undefined;

    return token;
  }
}
