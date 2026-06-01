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
  iat: number;
  exp: number;
}

// Small in-memory cache to avoid per-request DB hit for user freshness check.
// TTL keeps the window of admitted-but-deactivated tokens short.
const USER_CACHE = new Map<
  string,
  { role: string; is_active: boolean; expiresAt: number }
>();
const USER_CACHE_TTL_MS = 60_000; // 60 seconds

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

    // Re-check user against DB (cached) — rejects deactivated users
    // even if their JWT hasn't expired yet.
    const fresh = await this.getUserFreshness(payload.sub);
    if (!fresh.is_active) {
      throw new UnauthorizedException('User account is inactive');
    }
    // Trust the DB role over the JWT claim (handles role changes mid-session)
    payload.role = fresh.role;

    (request as Request & { user: JwtPayload }).user = payload;
    return true;
  }

  private async getUserFreshness(
    userId: string,
  ): Promise<{ role: string; is_active: boolean }> {
    const cached = USER_CACHE.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return { role: cached.role, is_active: cached.is_active };
    }
    const user = await this.prisma['users'].findUnique({
      where: { id: userId },
      select: { role: true, is_active: true },
    });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    USER_CACHE.set(userId, {
      role: user.role,
      is_active: user.is_active,
      expiresAt: Date.now() + USER_CACHE_TTL_MS,
    });
    return { role: user.role, is_active: user.is_active };
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
