import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RbacGuard } from '../guards/rbac.guard';

export const PERMISSION_KEY = 'permission';

/**
 * Combines JWT authentication and RBAC authorization into a single decorator.
 *
 * Usage:
 * ```ts
 * @RequirePermission('customer.create')
 * @Post()
 * create(@Body() dto: CreateCustomerDto) { ... }
 * ```
 *
 * The permission string is looked up in the shared PERMISSIONS constant
 * to determine which roles are allowed.
 */
export function RequirePermission(permission: string) {
  return applyDecorators(
    SetMetadata(PERMISSION_KEY, permission),
    UseGuards(JwtAuthGuard, RbacGuard),
  );
}
