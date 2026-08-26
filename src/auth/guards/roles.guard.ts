import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

type AuthenticatedRequestUser = {
  role?: UserRole;
  isSuperAdmin?: boolean;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedRequestUser }>();
    const user = request.user;
    const userRole = user?.role;

    if (!userRole) {
      return false;
    }

    if (userRole === UserRole.SUPERADMIN || user?.isSuperAdmin === true) {
      return true;
    }

    if (requiredRoles.includes(UserRole.SUPERADMIN)) {
      return false;
    }

    if (userRole === UserRole.ADMIN) {
      return true;
    }

    return requiredRoles.includes(userRole);
  }
}
