import type { ExecutionContext } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { FreelancerBootstrapThrottleGuard } from './freelancer-bootstrap-throttle.guard';

describe('FreelancerBootstrapThrottleGuard', () => {
  it('records denials with the normalized endpoint-specific policy', () => {
    const throttle = {
      assertWithinLimits: jest.fn(() => {
        throw new HttpException('Too many bootstrap attempts', 429);
      }),
    };
    const observability = {
      freelancerBootstrapDenied: jest.fn(),
    };
    const guard = new FreelancerBootstrapThrottleGuard(
      throttle as never,
      observability as never,
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          ip: '203.0.113.30',
          body: { email: ' Freelancer@Example.test ' },
        }),
      }),
    } as ExecutionContext;

    expect(() => guard.canActivate(context)).toThrow(HttpException);
    expect(throttle.assertWithinLimits).toHaveBeenCalledWith(
      '203.0.113.30',
      'freelancer@example.test',
    );
    expect(observability.freelancerBootstrapDenied).toHaveBeenCalledWith(
      'RATE_LIMITED',
      '203.0.113.30',
    );
  });
});
