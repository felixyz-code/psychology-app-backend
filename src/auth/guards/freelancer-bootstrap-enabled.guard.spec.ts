import { NotFoundException } from '@nestjs/common';
import { FreelancerBootstrapEnabledGuard } from './freelancer-bootstrap-enabled.guard';

describe('FreelancerBootstrapEnabledGuard', () => {
  it('denies the public bootstrap route when the feature flag is disabled', () => {
    const guard = new FreelancerBootstrapEnabledGuard({
      publicFreelancerBootstrapEnabled: false,
    } as never);

    expect(() => guard.canActivate()).toThrow(NotFoundException);
  });

  it('allows the public bootstrap route when the feature flag is enabled', () => {
    const guard = new FreelancerBootstrapEnabledGuard({
      publicFreelancerBootstrapEnabled: true,
    } as never);

    expect(guard.canActivate()).toBe(true);
  });
});
