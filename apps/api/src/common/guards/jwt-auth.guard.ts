import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { Request } from 'express';

export const IS_PUBLIC_KEY = 'isPublic';

export interface JwtPayload {
  sub: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Extracts and verifies the JWT from the `Authorization: Bearer <token>` header.
 * Attaches the decoded payload to `request.user`.
 *
 * Endpoints decorated with `@SetMetadata('isPublic', true)` skip verification.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Allow public endpoints to bypass auth
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

    try {
      const payload = jwt.verify(token, secret) as JwtPayload;
      (request as Request & { user: JwtPayload }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractToken(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) return undefined;

    return token;
  }
}
