import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { normalizeEmailIdentity } from '../src/common/identity/email-identity.util';
import { FreelancerBootstrapThrottleService } from '../src/auth/guards/freelancer-bootstrap-throttle.service';

const describeCertification =
  process.env.RUN_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification('Freelancer bootstrap runtime', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let throttleService: FreelancerBootstrapThrottleService;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Freelancer bootstrap E2E requires DATABASE_URL ending in _test',
      );
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'freelancer-bootstrap-jwt-key-2026';
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
    throttleService = moduleRef.get(FreelancerBootstrapThrottleService);
  });

  beforeEach(() => {
    throttleService.clear();
  });

  afterAll(async () => {
    await cleanupBootstrapEmails([
      `freelancer-success-${suffix}@example.test`,
      `freelancer-conflict-${suffix}@example.test`,
      `freelancer-concurrent-${suffix}@example.test`,
      `slug-first-${suffix}@example.test`,
      `slug-second-${suffix}@example.test`,
    ]);
    await app?.close();
    await prisma?.$disconnect();
  });

  it('creates the user, active organization, active owner membership, identity-only jwt, and login-compatible account', async () => {
    const email = ` Freelancer.Success-${suffix}@example.test `;
    const normalizedEmail = normalizeEmailIdentity(email);
    const password = 'FreelancerBootstrapSecret1!';
    const name = ' Dra. Ana Martinez ';
    const organizationName = ' Consultorio Ána Martínez ';

    const response = await request(app.getHttpServer())
      .post('/auth/freelancer-bootstrap')
      .send({
        email,
        password,
        name,
        organizationName,
      })
      .expect(201);

    const body = bootstrapBody(response.body as unknown);

    expect(body.user).toMatchObject({
      email: 'Freelancer.Success-' + suffix + '@example.test',
      role: UserRole.PSYCHOLOGIST,
    });
    expect(body.organization).toMatchObject({
      slug: `consultorio-ana-martinez`,
      status: OrganizationStatus.ACTIVE,
    });
    expect(body.membership).toMatchObject({
      userId: body.user.id,
      organizationId: body.organization.id,
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });

    const tokenPayload = jwtService.verify<Record<string, unknown>>(
      body.accessToken,
    );
    expect(tokenPayload).toMatchObject({
      sub: body.user.id,
      name: 'Dra. Ana Martinez',
      email: 'Freelancer.Success-' + suffix + '@example.test',
      role: UserRole.PSYCHOLOGIST,
    });
    expect(tokenPayload).not.toHaveProperty('organizationId');
    expect(tokenPayload).not.toHaveProperty('membershipId');

    const persistedUser = await prisma.user.findUnique({
      where: { id: body.user.id },
      select: {
        id: true,
        email: true,
        normalizedEmail: true,
        role: true,
        psychologistProfile: { select: { id: true } },
      },
    });
    expect(persistedUser).toMatchObject({
      id: body.user.id,
      email: 'Freelancer.Success-' + suffix + '@example.test',
      normalizedEmail,
      role: UserRole.PSYCHOLOGIST,
    });
    expect(persistedUser?.psychologistProfile).toBeNull();

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: `  FREELANCER.SUCCESS-${suffix}@EXAMPLE.TEST  `,
        password,
      })
      .expect(201);
    expect(loginResponseBody(login.body as unknown).user).toMatchObject({
      id: body.user.id,
    });

    const context = await request(app.getHttpServer())
      .get('/auth/context')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(context.body).toMatchObject({
      status: 'RESOLVED',
      tenantContext: {
        userId: body.user.id,
        organizationId: body.organization.id,
        membershipId: body.membership.id,
        organizationRole: MembershipRole.OWNER,
        legacyUserRole: UserRole.PSYCHOLOGIST,
      },
    });

    await cleanupBootstrapEmails([normalizedEmail]);
  });

  it('rejects an existing canonical email with the same uniform conflict contract', async () => {
    const email = `freelancer-conflict-${suffix}@example.test`;
    const password = 'FreelancerBootstrapSecret1!';

    await bootstrap(email, password, `Conflict Practice ${suffix}`).expect(201);

    const conflict = await bootstrap(
      `  FREELANCER-CONFLICT-${suffix}@EXAMPLE.TEST  `,
      password,
      `Conflict Practice Second ${suffix}`,
    ).expect(409);

    expect(conflict.body).toEqual({
      message: 'Registration could not be completed',
      error: 'Conflict',
      statusCode: 409,
    });

    expect(
      await prisma.user.count({
        where: {
          normalizedEmail: normalizeEmailIdentity(email),
        },
      }),
    ).toBe(1);
    expect(
      await prisma.organization.count({
        where: {
          displayName: `Conflict Practice Second ${suffix}`,
        },
      }),
    ).toBe(0);

    await cleanupBootstrapEmails([email]);
  });

  it('retries the generated slug when another bootstrap already claimed the base candidate', async () => {
    const password = 'FreelancerBootstrapSecret1!';

    const first = bootstrapBody(
      (
        await bootstrap(
          `slug-first-${suffix}@example.test`,
          password,
          `Shared Practice ${suffix}`,
        ).expect(201)
      ).body as unknown,
    );
    const second = bootstrapBody(
      (
        await bootstrap(
          `slug-second-${suffix}@example.test`,
          password,
          `Shared Practice ${suffix}`,
        ).expect(201)
      ).body as unknown,
    );

    expect(first.organization.slug).toBe(`shared-practice-${suffix}`);
    expect(second.organization.slug).toBe(`shared-practice-${suffix}-2`);

    await cleanupBootstrapEmails([
      `slug-first-${suffix}@example.test`,
      `slug-second-${suffix}@example.test`,
    ]);
  });

  it('commits exactly one bootstrap under concurrent identity contention and leaves no orphan organization', async () => {
    const email = `freelancer-concurrent-${suffix}@example.test`;
    const password = 'FreelancerBootstrapSecret1!';
    const firstOrganizationName = `Concurrent Primary ${suffix}`;
    const secondOrganizationName = `Concurrent Secondary ${suffix}`;

    const [first, second] = await Promise.all([
      bootstrap(email, password, firstOrganizationName),
      bootstrap(` ${email.toUpperCase()} `, password, secondOrganizationName),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);

    const users = await prisma.user.findMany({
      where: {
        normalizedEmail: normalizeEmailIdentity(email),
      },
      select: {
        id: true,
        memberships: {
          select: {
            id: true,
            role: true,
            status: true,
            organization: {
              select: {
                id: true,
                displayName: true,
              },
            },
          },
        },
      },
    });

    expect(users).toHaveLength(1);
    expect(users[0]?.memberships).toHaveLength(1);
    expect(users[0]?.memberships[0]).toMatchObject({
      role: MembershipRole.OWNER,
      status: MembershipStatus.ACTIVE,
    });

    const organizations = await prisma.organization.findMany({
      where: {
        displayName: {
          in: [firstOrganizationName, secondOrganizationName],
        },
      },
      select: { displayName: true },
      orderBy: { displayName: 'asc' },
    });
    expect(organizations).toHaveLength(1);

    await cleanupBootstrapEmails([email]);
  });

  function bootstrap(
    email: string,
    password: string,
    organizationName: string,
  ) {
    return request(app.getHttpServer())
      .post('/auth/freelancer-bootstrap')
      .send({
        email,
        password,
        name: 'Bootstrap Runtime User',
        organizationName,
      });
  }

  async function cleanupBootstrapEmails(emails: string[]) {
    const users = await prisma.user.findMany({
      where: {
        normalizedEmail: {
          in: emails.map((email) => normalizeEmailIdentity(email)),
        },
      },
      select: {
        id: true,
        memberships: {
          select: { organizationId: true },
        },
      },
    });

    if (users.length === 0) {
      return;
    }

    const userIds = users.map((user) => user.id);
    const organizationIds = [
      ...new Set(
        users.flatMap((user) =>
          user.memberships.map((membership) => membership.organizationId),
        ),
      ),
    ];

    await prisma.organizationMembership.deleteMany({
      where: {
        userId: { in: userIds },
      },
    });
    await prisma.organization.deleteMany({
      where: {
        id: { in: organizationIds },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    });
  }
});

type BootstrapResponseBody = {
  accessToken: string;
  user: { id: string; email: string };
  organization: { id: string; slug: string; status: OrganizationStatus };
  membership: {
    id: string;
    userId: string;
    organizationId: string;
    role: MembershipRole;
    status: MembershipStatus;
  };
};

type LoginResponseBody = {
  accessToken: string;
  user: { id: string };
};

function bootstrapBody(value: unknown): BootstrapResponseBody {
  if (!isRecord(value)) {
    throw new Error('Expected bootstrap response body');
  }

  return value as BootstrapResponseBody;
}

function loginResponseBody(value: unknown): LoginResponseBody {
  if (!isRecord(value)) {
    throw new Error('Expected login response body');
  }

  return value as LoginResponseBody;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
