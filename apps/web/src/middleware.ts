import { NextResponse, type NextRequest } from 'next/server';
import { decodeJwtPayload } from './lib/jwt';

/** Public routes that don't require authentication */
const PUBLIC_PATHS = ['/login'];

/**
 * Lightweight JWT payload decoder (no verification — the API server verifies).
 * We only decode to check expiry and extract role for client-side route gating.
 */
function decodeJwt(token: string): { sub: string; role: string; exp: number } | null {
  try {
    return decodeJwtPayload(token) as { sub: string; role: string; exp: number };
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Allow static assets and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Check for access token in cookie (set by auth-provider on login)
  const accessToken = request.cookies.get('access_token')?.value;

  if (!accessToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const payload = decodeJwt(accessToken);

  if (!payload) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Treat tokens as expired 30s early so downstream API calls don't race the exp boundary
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now + 30) {
    // Token expired (or about to) — let the client-side refresh handle it,
    // but redirect to login if clearly stale
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Attach role to request headers for downstream use
  const response = NextResponse.next();
  response.headers.set('x-user-role', payload.role);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
