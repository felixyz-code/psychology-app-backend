import {
  ConflictException,
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
import { RequestContextService } from '../common/request-context/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantObservabilityService } from '../tenant-context/tenant-observability.service';
import { Roles } from './decorators/roles.decorator';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { FreelancerBootstrapEnabledGuard } from './guards/freelancer-bootstrap-enabled.guard';
import { FreelancerBootstrapThrottleGuard } from './guards/freelancer-bootstrap-throttle.guard';
import { FreelancerBootstrapThrottleService } from './guards/freelancer-bootstrap-throttle.service';
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
  freelancerBootstrap: jest.Mock;
  updatePreferredOrganization: jest.Mock;
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
  let throttleService: FreelancerBootstrapThrottleService;
  let configService: {
    jwtSecret: string;
    publicFreelancerBootstrapEnabled: boolean;
  };

  beforeAll(async () => {
    authService = {
      login: jest.fn(),
      freelancerBootstrap: jest.fn(),
      updatePreferredOrganization: jest.fn(),
    };
    prisma = { user: { findUnique: jest.fn() } };
    configService = {
      jwtSecret: testJwtSecret,
      publicFreelancerBootstrapEnabled: true,
    };

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
          useValue: configService,
        },
        RequestContextService,
        FreelancerBootstrapEnabledGuard,
        FreelancerBootstrapThrottleGuard,
        FreelancerBootstrapThrottleService,
        {
          provide: TenantObservabilityService,
          useValue: { freelancerBootstrapDenied: jest.fn() },
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
    throttleService = moduleRef.get(FreelancerBootstrapThrottleService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
    throttleService.clear();
    configService.publicFreelancerBootstrapEnabled = true;
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
    [
      'invalid bootstrap email',
      {
        email: 'not-an-email',
        password: 'FreelancerBootstrapSecret1!',
        name: 'Bootstrap User',
        organizationName: 'Bootstrap Practice',
      },
    ],
    [
      'non-ascii bootstrap email',
      {
        email: 'josé@example.test',
        password: 'FreelancerBootstrapSecret1!',
        name: 'Bootstrap User',
        organizationName: 'Bootstrap Practice',
      },
    ],
    [
      'missing organizationName',
      {
        email: validEmail,
        password: 'FreelancerBootstrapSecret1!',
        name: 'Bootstrap User',
      },
    ],
    [
      'short bootstrap password',
      {
        email: validEmail,
        password: 'short',
        name: 'Bootstrap User',
        organizationName: 'Bootstrap Practice',
      },
    ],
  ])('returns a safe standard 400 response for %s', async (_scenario, body) => {
    const response = await request(app.getHttpServer())
      .post('/auth/freelancer-bootstrap')
      .send(body)
      .expect(400);

    const errorBody = toErrorBody(response.body as unknown);

    expect(errorBody.statusCode).toBe(400);
    expect(errorBody.error).toBe('Bad Request');
    expect(Array.isArray(errorBody.message)).toBe(true);
    expectSafeErrorBody(errorBody);
    expect(authService.freelancerBootstrap).not.toHaveBeenCalled();
  });

  it('strips extra bootstrap fields instead of rejecting the request', async () => {
    authService.freelancerBootstrap.mockResolvedValue({
      accessToken: 'issued-token',
      user: { id: 'user-id' },
      organization: { id: 'organization-id' },
      membership: { id: 'membership-id' },
    });

    await request(app.getHttpServer())
      .post('/auth/freelancer-bootstrap')
      .send({
        email: validEmail,
        password: 'FreelancerBootstrapSecret1!',
        name: 'Bootstrap User',
        organizationName: 'Bootstrap Practice',
        role: 'OWNER',
      })
      .expect(201);

    expect(authService.freelancerBootstrap).toHaveBeenCalledWith(
      {
        email: validEmail,
        password: 'FreelancerBootstrapSecret1!',
        name: 'Bootstrap User',
        organizationName: 'Bootstrap Practice',
      },
      expect.any(String),
    );
  });

  it.each([
    ['missing organizationId', {}],
    ['invalid uuid', { organizationId: 'not-a-uuid' }],
    ['empty string', { organizationId: '' }],
  ])(
    'returns a safe standard 400 response for invalid preferred-organization payload: %s',
    async (_scenario, body) => {
      const response = await request(app.getHttpServer())
        .put('/auth/context/preference')
        .set('Authorization', `Bearer ${issueToken(psychologistUser.id)}`)
        .send(body)
        .expect(400);

      const errorBody = toErrorBody(response.body as unknown);

      expect(errorBody.statusCode).toBe(400);
      expect(errorBody.error).toBe('Bad Request');
      expectSafeErrorBody(errorBody);
      expect(authService.updatePreferredOrganization).not.toHaveBeenCalled();
    },
  );

  it('rejects extra preferred-organization fields instead of silently stripping them', async () => {
    const response = await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', `Bearer ${issueToken(psychologistUser.id)}`)
      .send({
        organizationId: null,
        membershipId: 'should-not-be-accepted',
      })
      .expect(400);

    const errorBody = toErrorBody(response.body as unknown);

    expect(errorBody.statusCode).toBe(400);
    expect(errorBody.error).toBe('Bad Request');
    expect(JSON.stringify(errorBody)).toContain(
      'property membershipId should not exist',
    );
    expect(authService.updatePreferredOrganization).not.toHaveBeenCalled();
  });

  it('accepts an explicit null preferred-organization clear payload', async () => {
    authService.updatePreferredOrganization.mockResolvedValue({
      preferredOrganizationId: null,
    });

    await request(app.getHttpServer())
      .put('/auth/context/preference')
      .set('Authorization', `Bearer ${issueToken(psychologistUser.id)}`)
      .send({ organizationId: null })
      .expect(200, {
        preferredOrganizationId: null,
      });

    expect(authService.updatePreferredOrganization).toHaveBeenCalledWith(
      psychologistUser,
      { organizationId: null },
    );
  });

  it('returns 404 when the public bootstrap feature flag is disabled', async () => {
    configService.publicFreelancerBootstrapEnabled = false;

    const response = await request(app.getHttpServer())
      .post('/auth/freelancer-bootstrap')
      .send({
        email: validEmail,
        password: 'FreelancerBootstrapSecret1!',
        name: 'Bootstrap User',
        organizationName: 'Bootstrap Practice',
      })
      .expect(404);

    const errorBody = toErrorBody(response.body as unknown);

    expect(errorBody).toMatchObject({
      message: 'Not Found',
      statusCode: 404,
    });
    expect(authService.freelancerBootstrap).not.toHaveBeenCalled();
  });

  it('returns the same safe 409 response for bootstrap conflicts without leaking identity details', async () => {
    authService.freelancerBootstrap.mockRejectedValue(
      new ConflictException('Registration could not be completed'),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/freelancer-bootstrap')
      .send({
        email: ' Existing@Example.test ',
        password: 'FreelancerBootstrapSecret1!',
        name: 'Existing User',
        organizationName: 'Existing Practice',
      })
      .expect(409);

    const errorBody = toErrorBody(response.body as unknown);

    expect(errorBody.message).toBe('Registration could not be completed');
    expectSafeErrorBody(errorBody);
    expect(JSON.stringify(errorBody)).not.toContain('Existing@Example.test');
  });

  it('returns a uniform safe 429 response after repeated bootstrap attempts for the same normalized email', async () => {
    authService.freelancerBootstrap.mockResolvedValue({
      accessToken: 'issued-token',
      user: { id: 'user-id' },
      organization: { id: 'organization-id' },
      membership: { id: 'membership-id' },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await request(app.getHttpServer())
        .post('/auth/freelancer-bootstrap')
        .send({
          email:
            attempt % 2 === 0
              ? ' Freelancer@Example.test '
              : 'freelancer@example.test',
          password: 'FreelancerBootstrapSecret1!',
          name: 'Bootstrap User',
          organizationName: `Bootstrap Practice ${attempt}`,
        })
        .expect(201);
    }

    const throttled = await request(app.getHttpServer())
      .post('/auth/freelancer-bootstrap')
      .send({
        email: 'FREELANCER@example.test',
        password: 'FreelancerBootstrapSecret1!',
        name: 'Bootstrap User',
        organizationName: 'Bootstrap Practice Final',
      })
      .expect(429);

    const errorBody = toErrorBody(throttled.body as unknown);

    expect(errorBody).toEqual({
      message: 'Too many bootstrap attempts',
      error: 'Too Many Requests',
      statusCode: 429,
    });
    expectSafeErrorBody(errorBody);
    expect(authService.freelancerBootstrap).toHaveBeenCalledTimes(3);
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
