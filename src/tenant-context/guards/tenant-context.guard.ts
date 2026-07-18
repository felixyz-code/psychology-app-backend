import {
  CanActivate,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';
import { AuthenticatedUser } from '../../auth/types/authenticated-user.type';
import { RequestContextService } from '../../common/request-context/request-context.service';
import {
  SKIP_TENANT_CONTEXT_KEY,
  TENANT_REQUIRED_KEY,
} from '../tenant-context.constants';
import { TenantResolverService } from '../tenant-resolver.service';
import {
  TenantResolutionFailure,
  TenantContext,
} from '../tenant-context.types';

type TenantRequest = {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  rawHeaders?: string[];
  tenantContext?: TenantContext;
};

@Injectable()
export class TenantContextGuard implements CanActivate {
  private readonly logger = new Logger(TenantContextGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: TenantResolverService,
    private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const skipTenantContext = this.reflector.getAllAndOverride<boolean>(
      SKIP_TENANT_CONTEXT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic || skipTenantContext) {
      return true;
    }

    const request = context.switchToHttp().getRequest<TenantRequest>();
    if (!request.user) {
      // JwtAuthGuard owns the 401 response; this protects isolated guard use.
      return false;
    }

    const required = this.reflector.getAllAndOverride<boolean>(
      TENANT_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );
    const resolution = await this.resolver.resolve(request.user, request);

    if (resolution.tenantContext) {
      // The request field is a reference to the immutable ALS value for decorators.
      request.tenantContext = resolution.tenantContext;
      this.requestContext.setTenantContext(resolution.tenantContext);
      return true;
    }

    if (!required) {
      this.logger.warn(
        JSON.stringify({
          event: 'tenant_context_unresolved',
          userId: request.user.id,
          resolutionFailure: resolution.failure,
        }),
      );
      return true;
    }

    if (resolution.failure === TenantResolutionFailure.AMBIGUOUS_MEMBERSHIPS) {
      throw new ConflictException('Organization selection is required');
    }

    throw new ForbiddenException('Tenant context is required');
  }
}
