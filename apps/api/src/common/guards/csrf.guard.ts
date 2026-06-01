import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { randomBytes, timingSafeEqual } from 'crypto';
import { IS_PUBLIC_KEY } from './jwt-auth.guard';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Double-submit-cookie CSRF defense.
 *
 * - Read endpoints (GET, HEAD, OPTIONS) issue a new csrf_token cookie if absent.
 *   The cookie is NOT HttpOnly so frontend JS can read it.
 * - State-changing requests (POST/PATCH/PUT/DELETE) must echo the cookie value
 *   in the x-csrf-token header. Mismatch → 403.
 *
 * Combined with SameSite=Strict on the access cookie, this defeats CSRF even
 * if an attacker tricks the browser into sending requests, because they can't
 * read the csrf_token cookie cross-origin.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { cookies?: Record<string, string> }>();
    const res = context.switchToHttp().getResponse<Response>();

    const method = req.method.toUpperCase();
    const isSafe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

    // Public endpoints + safe methods: just ensure the token cookie exists
    if (isSafe) {
      this.ensureCsrfCookie(req, res);
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      // Login/refresh are public — still issue a token for subsequent requests
      this.ensureCsrfCookie(req, res);
      return true;
    }

    const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
    const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;

    if (!cookieToken || !headerToken) {
      throw new ForbiddenException('Missing CSRF token');
    }

    if (
      cookieToken.length !== headerToken.length ||
      !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))
    ) {
      throw new ForbiddenException('CSRF token mismatch');
    }

    return true;
  }

  private ensureCsrfCookie(req: Request & { cookies?: Record<string, string> }, res: Response): void {
    if (req.cookies?.[CSRF_COOKIE_NAME]) return;
    const token = randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false, // Frontend must read it
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24h
      path: '/',
    });
  }
}
