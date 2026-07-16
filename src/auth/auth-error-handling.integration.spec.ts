import {
  Controller,
  Get,
  INestApplication,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from './decorators/roles.decorator';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

const testJwtSecret = 'test-only-jwt-secret-not-for-production';
const validEmail = 'psychologist@example.test';
const validPassword = 'valid-password';

type PrismaMock = {
  user: {
    findUnique: jest.Mock;
  };
};

type AuthServiceMock = {
  login: jest.Mock;
};

const adminUser = {
  id: 'admin-user-id',
  name: 'Admin',
  email: 'admin@example.test',
  role: UserRole.ADMIN,
};

const psychologistUser = {
  id: 'psychologist-user-id',
  name: 'Psychologist',
  email: validEmail,
  role: UserRole.PSYCHOLOGIST,
};

const userWithoutRole = {
  id: 'no-role-user-id',
  name: 'No Role',
  email: 'no-role@example.test',
};

@Controller('auth-error-harness')
class AuthErrorHarnessController {
  @Get('admin')
  @Roles(UserRole.ADMIN)
  adminOnly() {
    return { ok: true };
  }

  @Get('not-found')
  @Roles(UserRole.ADMIN)
  notFound() {
    throw new NotFoundException('Resource not found');
  }
}

function toErrorBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Expected a JSON error response body');
  }

  return body as Record<string, unknown>;
}

function expectSafeErrorBody(body: Record<string, unknown>) {
  const serialized = JSON.stringify(body);

  expect(body).not.toHaveProperty('accessToken');
  expect(body).not.toHaveProperty('stack');
  expect(serialized).not.toContain(testJwtSecret);
  expect(serialized).not.toContain('passwordHash');
  expect(serialized).not.toContain('DATABASE_URL');
  expect(serialized).not.toContain('PrismaClient');
  expect(serialized).not.toContain('/uploads');
}

describe('Authentication error handling (integration)', () => {
  let app: INestApplication<App>;
  let authService: AuthServiceMock;
  let prisma: PrismaMock;
  let jwtService: JwtService;

  beforeAll(async () => {
    authService = { login: jest.fn() };
    prisma = { user: { findUnique: jest.fn() } };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [PassportModule, JwtModule.register({ secret: testJwtSecret })],
      controllers: [AuthController, AuthErrorHarnessController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        {
          provide: AuthService,
          useValue: authService,
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
        {
          provide: AppConfigService,
          useValue: { jwtSecret: testJwtSecret },
        },
        {
          provide: APP_GUARD,
          useClass: JwtAuthGuard,
        },
        {
          provide: APP_GUARD,
          useClass: RolesGuard,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const users = new Map([
      [adminUser.id, adminUser],
      [psychologistUser.id, psychologistUser],
      [userWithoutRole.id, userWithoutRole],
    ]);
    prisma.user.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) =>
        Promise.resolve(users.get(where.id) ?? null),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  function issueToken(
    userId: string,
    expiresIn?: number,
    secret = testJwtSecret,
  ) {
    const signer =
      secret === testJwtSecret ? jwtService : new JwtService({ secret });

    return signer.sign(
      {
        sub: userId,
        name: 'Token User',
        email: 'token@example.test',
        role: UserRole.PSYCHOLOGIST,
      },
      expiresIn === undefined ? undefined : { expiresIn },
    );
  }

  function requestProtected(token?: string) {
    const httpRequest = request(app.getHttpServer()).get(
      '/auth-error-harness/admin',
    );

    return token
      ? httpRequest.set('Authorization', `Bearer ${token}`)
      : httpRequest;
  }

  it('returns the same safe 401 response for unknown email and incorrect password', async () => {
    authService.login.mockRejectedValue(
      new UnauthorizedException('Invalid email or password'),
    );

    const unknownEmail = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'unknown@example.test', password: validPassword })
      .expect(401);
    const incorrectPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: validEmail, password: 'incorrect-password' })
      .expect(401);

    const unknownEmailBody = toErrorBody(unknownEmail.body as unknown);
    const incorrectPasswordBody = toErrorBody(
      incorrectPassword.body as unknown,
    );

    expect(unknownEmailBody.message).toBe('Invalid email or password');
    expect(incorrectPasswordBody.message).toBe('Invalid email or password');
    expect(unknownEmailBody).toEqual(incorrectPasswordBody);
    expectSafeErrorBody(unknownEmailBody);
    expectSafeErrorBody(incorrectPasswordBody);
    expect(authService.login).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['invalid email', { email: 'not-an-email', password: validPassword }],
    ['missing password', { email: validEmail }],
    ['short password', { email: validEmail, password: 'short' }],
    ['empty body', {}],
  ])('returns a safe standard 400 response for %s', async (_scenario, body) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send(body)
      .expect(400);

    const errorBody = toErrorBody(response.body as unknown);

    expect(errorBody.statusCode).toBe(400);
    expect(errorBody.error).toBe('Bad Request');
    expect(Array.isArray(errorBody.message)).toBe(true);
    if (!Array.isArray(errorBody.message)) {
      throw new Error('Expected validation messages');
    }
    expect(errorBody.message.length).toBeGreaterThan(0);
    expectSafeErrorBody(errorBody);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('strips an extra login field instead of rejecting the request', async () => {
    authService.login.mockResolvedValue({ accessToken: 'issued-token' });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: validEmail,
        password: validPassword,
        unexpected: 'discarded-by-whitelist',
      })
      .expect(201);

    expect(authService.login).toHaveBeenCalledWith({
      email: validEmail,
      password: validPassword,
    });
  });

  it.each([
    ['missing token', undefined],
    ['malformed token', 'not-a-jwt'],
    ['expired token', () => issueToken(adminUser.id, -1)],
    [
      'invalid signature',
      () => issueToken(adminUser.id, undefined, 'wrong-test-secret'),
    ],
    ['deleted user', () => issueToken('deleted-user-id')],
  ])(
    'returns a generic safe 401 response for %s',
    async (_scenario, tokenFactory) => {
      const token =
        typeof tokenFactory === 'function' ? tokenFactory() : tokenFactory;
      const response = await requestProtected(token).expect(401);

      const errorBody = toErrorBody(response.body as unknown);

      expect(errorBody.statusCode).toBe(401);
      expect(errorBody.message).toBe('Unauthorized');
      expect(JSON.stringify(errorBody)).not.toContain('jwt malformed');
      expectSafeErrorBody(errorBody);
    },
  );

  it('returns 200 for an authenticated administrator with the required role', async () => {
    await requestProtected(issueToken(adminUser.id)).expect(200, { ok: true });
  });

  it('returns 403, not 401, for an authenticated psychologist without the required role', async () => {
    const response = await requestProtected(
      issueToken(psychologistUser.id),
    ).expect(403);

    const errorBody = toErrorBody(response.body as unknown);

    expect(errorBody).toEqual({
      message: 'Forbidden resource',
      error: 'Forbidden',
      statusCode: 403,
    });
    expectSafeErrorBody(errorBody);
  });

  it('returns 403 for an authenticated user without a role', async () => {
    const response = await requestProtected(
      issueToken(userWithoutRole.id),
    ).expect(403);

    const errorBody = toErrorBody(response.body as unknown);

    expect(errorBody.statusCode).toBe(403);
    expect(errorBody.message).toBe('Forbidden resource');
    expectSafeErrorBody(errorBody);
  });

  it('returns a safe 404 body for a protected missing resource', async () => {
    const response = await request(app.getHttpServer())
      .get('/auth-error-harness/not-found')
      .set('Authorization', `Bearer ${issueToken(adminUser.id)}`)
      .expect(404);

    const errorBody = toErrorBody(response.body as unknown);

    expect(errorBody).toEqual({
      message: 'Resource not found',
      error: 'Not Found',
      statusCode: 404,
    });
    expectSafeErrorBody(errorBody);
  });
});
