import { HttpException } from '@nestjs/common';
import { normalizeEmailIdentity } from '../../common/identity/email-identity.util';
import { FreelancerBootstrapThrottleService } from './freelancer-bootstrap-throttle.service';

describe('FreelancerBootstrapThrottleService', () => {
  let service: FreelancerBootstrapThrottleService;

  beforeEach(() => {
    service = new FreelancerBootstrapThrottleService();
  });

  it('throttles by normalized email regardless of trim or casing', () => {
    const now = 1_000;
    const normalizedEmail = normalizeEmailIdentity(' Freelancer@Example.test ');

    for (let index = 0; index < 3; index += 1) {
      expect(() =>
        service.assertWithinLimits(
          '203.0.113.10',
          normalizedEmail,
          now + index,
        ),
      ).not.toThrow();
    }

    expect(() =>
      service.assertWithinLimits(
        '203.0.113.11',
        normalizeEmailIdentity('freelancer@example.test'),
        now + 6,
      ),
    ).toThrow(HttpException);
  });

  it('throttles by IP even when the email rotates', () => {
    const now = 5_000;

    for (let index = 0; index < 5; index += 1) {
      expect(() =>
        service.assertWithinLimits(
          '203.0.113.20',
          `freelancer-${index}@example.test`,
          now + index,
        ),
      ).not.toThrow();
    }

    expect(() =>
      service.assertWithinLimits(
        '203.0.113.20',
        'another-freelancer@example.test',
        now + 11,
      ),
    ).toThrow(HttpException);
  });
});
