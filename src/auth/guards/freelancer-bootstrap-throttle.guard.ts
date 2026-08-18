import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { normalizeEmailIdentity } from '../../common/identity/email-identity.util';
import { TenantObservabilityService } from '../../tenant-context/tenant-observability.service';
import { FreelancerBootstrapThrottleService } from './freelancer-bootstrap-throttle.service';

type BootstrapRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
  body?: { email?: unknown };
};

@Injectable()
export class FreelancerBootstrapThrottleGuard implements CanActivate {
  constructor(
    private readonly throttle: FreelancerBootstrapThrottleService,
    private readonly observability: TenantObservabilityService,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<BootstrapRequest>();
    const ipAddress =
      request.ip ?? request.socket?.remoteAddress ?? 'unknown-client';
    const normalizedEmail =
      typeof request.body?.email === 'string' && request.body.email.trim()
        ? normalizeEmailIdentity(request.body.email)
        : null;

    try {
      this.throttle.assertWithinLimits(ipAddress, normalizedEmail);
      return true;
    } catch (error) {
      this.observability.freelancerBootstrapDenied('RATE_LIMITED', ipAddress);
      throw error;
    }
  }
}
