import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
const MAX_BOOTSTRAP_ATTEMPTS_PER_IP = 5;
const MAX_BOOTSTRAP_ATTEMPTS_PER_EMAIL = 3;
const TOO_MANY_BOOTSTRAP_ATTEMPTS = 'Too many bootstrap attempts';

@Injectable()
export class FreelancerBootstrapThrottleService {
  private readonly attemptsByIp = new Map<string, number[]>();
  private readonly attemptsByEmail = new Map<string, number[]>();

  assertWithinLimits(
    ipAddress: string,
    normalizedEmail: string | null,
    now = Date.now(),
  ) {
    this.consume(
      this.attemptsByIp,
      ipAddress,
      MAX_BOOTSTRAP_ATTEMPTS_PER_IP,
      now,
    );

    if (normalizedEmail) {
      this.consume(
        this.attemptsByEmail,
        hashThrottleKey(normalizedEmail),
        MAX_BOOTSTRAP_ATTEMPTS_PER_EMAIL,
        now,
      );
    }
  }

  clear() {
    this.attemptsByIp.clear();
    this.attemptsByEmail.clear();
  }

  private consume(
    bucket: Map<string, number[]>,
    key: string,
    maxAttempts: number,
    now: number,
  ) {
    const active = (bucket.get(key) ?? []).filter(
      (timestamp) => now - timestamp < THROTTLE_WINDOW_MS,
    );

    if (active.length >= maxAttempts) {
      bucket.set(key, active);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: TOO_MANY_BOOTSTRAP_ATTEMPTS,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    active.push(now);
    bucket.set(key, active);
  }
}

function hashThrottleKey(value: string) {
  return createHash('sha256').update(value).digest('hex');
}
