import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AppConfigService } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
  };
};

type PassportJwtInternals = {
  _jwtFromRequest: (request: {
    headers: Record<string, string | undefined>;
  }) => string | null;
  _secretOrKeyProvider: (
    request: object,
    token: string,
    done: (error: Error | null, secret?: string) => void,
  ) => void;
  _verifOpts: {
    ignoreExpiration: boolean;
  };
};

const payload: JwtPayload = {
  sub: 'user-id',
  name: 'Stale Name',
  email: 'stale@example.com',
  role: UserRole.PSYCHOLOGIST,
};

const currentUser = {
  id: payload.sub,
  name: 'Current Name',
  email: 'current@example.com',
  role: UserRole.ADMIN,
};

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: PrismaMock;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    strategy = new JwtStrategy(
      { jwtSecret: 'test-jwt-secret' } as AppConfigService,
      prisma as unknown as PrismaService,
    );
  });

  it('uses current user data rather than token claims', async () => {
    prisma.user.findUnique.mockResolvedValue(currentUser);

    await expect(strategy.validate(payload)).resolves.toEqual(currentUser);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: payload.sub },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
    });
  });

  it('rejects an unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a deleted user in the same way as an unknown user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a missing or invalid subject claim before querying Prisma', async () => {
    await expect(
      strategy.validate({ ...payload, sub: '' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('configures Bearer extraction, expiration validation, and the runtime secret', () => {
    const internals = strategy as unknown as PassportJwtInternals;

    expect(
      internals._jwtFromRequest({
        headers: { authorization: 'Bearer token-value' },
      }),
    ).toBe('token-value');
    expect(
      internals._jwtFromRequest({
        headers: { authorization: 'JWT token-value' },
      }),
    ).toBeNull();
    expect(internals._verifOpts.ignoreExpiration).toBe(false);

    internals._secretOrKeyProvider({}, 'token-value', (error, secret) => {
      expect(error).toBeNull();
      expect(secret).toBe('test-jwt-secret');
    });
  });
});
