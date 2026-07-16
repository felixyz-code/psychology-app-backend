import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ compare: jest.fn() }));

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
  };
};

const user = {
  id: 'user-id',
  name: 'Current User',
  email: 'user@example.com',
  passwordHash: 'stored-password-hash',
  role: UserRole.PSYCHOLOGIST,
};

async function expectInvalidCredentials(login: Promise<unknown>) {
  try {
    await login;
    throw new Error('Expected login to reject');
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as UnauthorizedException).message).toBe(
      'Invalid email or password',
    );
    expect((error as UnauthorizedException).getStatus()).toBe(401);
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaMock;
  let jwtService: { signAsync: jest.Mock };
  let bcryptCompare: jest.MockedFunction<typeof bcrypt.compare>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
    };
    jwtService = {
      signAsync: jest.fn(),
    };
    bcryptCompare = bcrypt.compare as jest.MockedFunction<
      typeof bcrypt.compare
    >;
    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('signs the contractual payload and returns only the public user fields', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    bcryptCompare.mockResolvedValue(true as never);
    jwtService.signAsync.mockResolvedValue('access-token');

    await expect(
      service.login({ email: user.email, password: 'correct-password' }),
    ).resolves.toEqual({
      accessToken: 'access-token',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    expect(bcryptCompare).toHaveBeenCalledWith(
      'correct-password',
      user.passwordHash,
    );
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  });

  it('rejects an unknown user with a generic error without signing a token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expectInvalidCredentials(
      service.login({ email: 'unknown@example.com', password: 'password' }),
    );

    expect(bcryptCompare).not.toHaveBeenCalled();
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it('rejects an invalid password with the same generic error without signing a token', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    bcryptCompare.mockResolvedValue(false as never);

    await expectInvalidCredentials(
      service.login({ email: user.email, password: 'incorrect-password' }),
    );

    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });
});
