import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS, UserRole } from '@as-finance/shared';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { JwtPayload } from './jwt-auth.guard';
import { Request } from 'express';

/**
 * Checks the `@RequirePermission('module.action')` metadata against the
 * authenticated user's role using the shared PERMISSIONS constant.
 *
 * If no permission metadata is set on the handler, access is allowed
 * (the endpoint is open to any authenticated user).
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permission = this.reflector.getAllAndOverride<string | undefined>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission metadata → open to any authenticated user
    if (!permission) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const user = request.user;

    if (!user?.role) {
      throw new ForbiddenException('User role not found');
    }

    const allowedRoles = PERMISSIONS[permission] as readonly string[] | undefined;
    if (!allowedRoles) {
      // Permission key not in matrix → deny by default (least privilege)
      throw new ForbiddenException(`Unknown permission: ${permission}`);
    }

    if (!allowedRoles.includes(user.role as UserRole)) {
      throw new ForbiddenException(
        `Role '${user.role}' is not authorized for '${permission}'`,
      );
    }

    return true;
  }
}
