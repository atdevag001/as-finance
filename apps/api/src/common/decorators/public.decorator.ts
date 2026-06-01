import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../guards/jwt-auth.guard';

/**
 * Marks an endpoint as publicly accessible (skips global JwtAuthGuard).
 * Use sparingly — only for /auth/login, /auth/refresh, /healthz, etc.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
