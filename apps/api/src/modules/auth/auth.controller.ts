import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  HttpCode,
  HttpStatus,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { IS_PUBLIC_KEY, JwtAuthGuard, JwtPayload } from '../../common/guards/jwt-auth.guard';
import { AuthorizationError } from '../../common/errors';

const REFRESH_COOKIE_NAME = 'refresh_token';
const ACCESS_COOKIE_NAME = 'access_token';
const REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Parse JWT_EXPIRY (e.g. '15m', '60m', '1h') into milliseconds so the
 * cookie maxAge tracks the actual JWT TTL. Falls back to 15min if the
 * env value is missing or unparseable. Without this, a JWT_EXPIRY=60m
 * still left the browser stopping sending the cookie at the 15min
 * hardcoded mark — visible only on long-running E2E suites.
 */
function parseJwtExpiryMs(): number {
  const raw = (process.env['JWT_EXPIRY'] ?? '15m').trim();
  const m = raw.match(/^(\d+)\s*([smhd])?$/i);
  if (!m) return 15 * 60 * 1000;
  const n = parseInt(m[1]!, 10);
  const unit = (m[2] ?? 's').toLowerCase();
  const mult: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * (mult[unit] ?? 1000);
}
const ACCESS_COOKIE_MAX_AGE_MS = parseJwtExpiryMs();

function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict' as const,
    maxAge: ACCESS_COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { ttl: 60_000, limit: 100 } }) // 100 req/min per IP on auth endpoints (increased for E2E tests)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @SetMetadata(IS_PUBLIC_KEY, true)
  @Throttle({ login: { ttl: 60_000, limit: process.env['NODE_ENV'] === 'test' ? 1000 : 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate user and issue tokens' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 403, description: 'Invalid credentials or account locked' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, {
      ipAddress: req.ip ?? '0.0.0.0',
      requestId:
        (req as Request & { requestId?: string }).requestId ??
        '00000000-0000-0000-0000-000000000000',
    });

    // Access token: HttpOnly cookie (XSS-resistant); JwtAuthGuard reads it
    res.cookie(ACCESS_COOKIE_NAME, result.accessToken, accessCookieOptions());

    // Refresh token: HttpOnly cookie (already)
    const refreshToken = (result as unknown as { refreshToken: string }).refreshToken;
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/',
    });

    // accessToken returned in body for transitional clients using Authorization: Bearer
    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @SetMetadata(IS_PUBLIC_KEY, true)
  @Throttle({ refresh: { ttl: 60_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  @ApiResponse({ status: 200, description: 'Token refreshed' })
  @ApiResponse({ status: 403, description: 'Invalid or expired refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const currentRefreshToken = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!currentRefreshToken) {
      throw new AuthorizationError(
        'No refresh token provided',
        'MISSING_REFRESH_TOKEN',
      );
    }

    const result = await this.authService.refreshToken(currentRefreshToken, {
      ipAddress: req.ip ?? '0.0.0.0',
      requestId:
        (req as Request & { requestId?: string }).requestId ??
        '00000000-0000-0000-0000-000000000000',
    });

    // Rotate access cookie
    res.cookie(ACCESS_COOKIE_NAME, result.accessToken, accessCookieOptions());

    // Rotate refresh cookie
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: REFRESH_COOKIE_MAX_AGE_MS,
      path: '/',
    });

    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and revoke refresh token' })
  @ApiResponse({ status: 200, description: 'Logged out successfully' })
  async logout(
    @Req() req: Request & { user: JwtPayload; requestId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(req.user.sub, {
      ipAddress: req.ip ?? '0.0.0.0',
      requestId: req.requestId ?? '00000000-0000-0000-0000-000000000000',
    });

    // Clear both cookies
    res.clearCookie(ACCESS_COOKIE_NAME, accessCookieOptions());
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return { message: 'Logged out successfully' };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @Throttle({ changePassword: { ttl: 60_000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change password and invalidate all sessions' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 403, description: 'Current password incorrect' })
  async changePassword(
    @Req() req: Request & { user: JwtPayload; requestId?: string },
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.changePassword(req.user.sub, dto, {
      ipAddress: req.ip ?? '0.0.0.0',
      requestId: req.requestId ?? '00000000-0000-0000-0000-000000000000',
    });

    // Clear refresh token cookie since all sessions are invalidated
    res.clearCookie(REFRESH_COOKIE_NAME, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      path: '/',
    });

    return { message: 'Password changed successfully' };
  }
}
