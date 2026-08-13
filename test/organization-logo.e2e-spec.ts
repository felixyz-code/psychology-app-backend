import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { normalizeEmailIdentity } from '../src/common/identity/email-identity.util';

const describeCertification =
  process.env.RUN_ORGANIZATION_LOGO_TESTS === 'true' ? describe : describe.skip;

describeCertification('Organization logo protected lifecycle', () => {
  let app: INestApplication<App>;
  let prisma: PrismaClient;
  let jwtService: JwtService;
  let uploadsPath: string;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();
  const ownerUserId = randomUUID();
  const adminUserId = randomUUID();
  const revokedUserId = randomUUID();
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Organization logo E2E requires DATABASE_URL ending in _test',
      );
    }
    uploadsPath = await mkdtemp(join(tmpdir(), 'psychology-logo-e2e-'));
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = 'organization-logo-e2e-jwt-key-2026';
    process.env.UPLOADS_PATH = uploadsPath;
    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    await prisma.user.createMany({
      data: [
        user(ownerUserId, `logo-owner-${suffix}@example.test`),
        user(adminUserId, `logo-admin-${suffix}@example.test`),
        user(revokedUserId, `logo-revoked-${suffix}@example.test`),
      ],
    });
    await prisma.organization.createMany({
      data: [
        organization(organizationAId, `logo-a-${suffix}`),
        organization(organizationBId, `logo-b-${suffix}`),
      ],
    });
    await prisma.organizationMembership.createMany({
      data: [
        membership(ownerUserId, organizationAId, MembershipRole.OWNER),
        membership(ownerUserId, organizationBId, MembershipRole.OWNER),
        membership(adminUserId, organizationAId, MembershipRole.ADMIN),
        membership(
          revokedUserId,
          organizationAId,
          MembershipRole.OWNER,
          MembershipStatus.REVOKED,
        ),
      ],
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    jwtService = moduleRef.get(JwtService);
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.organizationMembership.deleteMany({
      where: { userId: { in: [ownerUserId, adminUserId, revokedUserId] } },
    });
    await prisma?.organization.deleteMany({
      where: { id: { in: [organizationAId, organizationBId] } },
    });
    await prisma?.user.deleteMany({
      where: { id: { in: [ownerUserId, adminUserId, revokedUserId] } },
    });
    await prisma?.$disconnect();
    await rm(uploadsPath, { recursive: true, force: true });
  });

  it('protects absent metadata, content, tenant scope, and mutation capability', async () => {
    const ownerToken = bearer(ownerUserId);
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/logo`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/logo`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAId)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual({
          rowState: 'ABSENT',
          updatedAt: null,
          mimeType: null,
          byteSize: null,
          width: null,
          height: null,
        });
      });
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/logo/content`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAId)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/organizations/${organizationBId}/logo`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAId)
      .expect(404);
    await request(app.getHttpServer())
      .put(`/organizations/${organizationAId}/logo`)
      .set('Authorization', bearer(adminUserId))
      .set('X-Organization-Id', organizationAId)
      .field('expectedRowState', 'ABSENT')
      .attach('file', png(64, 64), {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(403);
    await upload(ownerToken, organizationAId, Buffer.alloc(1024 * 1024 + 1), {
      expectedRowState: 'ABSENT',
    }).expect(413);
    await request(app.getHttpServer())
      .put(`/organizations/${organizationAId}/logo`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAId)
      .field('expectedRowState', 'ABSENT')
      .attach('file', png(64, 64), {
        filename: 'first.png',
        contentType: 'image/png',
      })
      .attach('file', png(64, 64), {
        filename: 'second.png',
        contentType: 'image/png',
      })
      .expect(400);

    const filesBeforeMalformedUpload =
      await organizationLogoFiles(organizationAId);
    await upload(ownerToken, organizationAId, pngWithInvalidPayload(64, 64), {
      expectedRowState: 'ABSENT',
    }).expect(400);
    await expect(
      prisma.organizationLogoAsset.findUnique({
        where: { organizationId: organizationAId },
      }),
    ).resolves.toBeNull();
    await expect(organizationLogoFiles(organizationAId)).resolves.toEqual(
      filesBeforeMalformedUpload,
    );
  });

  it('creates, streams, replaces, and removes only canonical private content', async () => {
    const ownerToken = bearer(ownerUserId);
    const first = await upload(ownerToken, organizationAId, png(64, 64), {
      expectedRowState: 'ABSENT',
    }).expect(200);
    const firstBody = first.body as LogoResponse;
    expect(firstBody).toMatchObject({
      rowState: 'PRESENT',
      mimeType: 'image/png',
      width: 64,
      height: 64,
    });
    expect(firstBody.storageKey).toBeUndefined();
    const stream = await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/logo/content`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAId)
      .expect(200);
    expect(stream.headers['cache-control']).toBe(
      'private, max-age=0, must-revalidate',
    );
    expect(stream.headers.etag).toBeDefined();
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/logo/content`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAId)
      .set('If-None-Match', stream.headers.etag)
      .expect(304);
    const replacement = await upload(ownerToken, organizationAId, png(80, 80), {
      expectedUpdatedAt: firstBody.updatedAt,
    }).expect(200);
    const replacementBody = replacement.body as LogoResponse;
    expect(replacementBody).toMatchObject({ width: 80, height: 80 });
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationAId}/logo`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationAId)
      .send({ expectedUpdatedAt: replacementBody.updatedAt })
      .expect(200)
      .expect((response) => {
        expect((response.body as LogoResponse).rowState).toBe('ABSENT');
      });
    await expect(
      prisma.organizationLogoAsset.findUnique({
        where: { organizationId: organizationAId },
      }),
    ).resolves.toBeNull();
  });

  it('denies every logo runtime path to a revoked membership', async () => {
    const revokedToken = bearer(revokedUserId);
    const headers = {
      Authorization: revokedToken,
      'X-Organization-Id': organizationAId,
    };

    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/logo`)
      .set(headers)
      .expect(403);
    await request(app.getHttpServer())
      .get(`/organizations/${organizationAId}/logo/content`)
      .set(headers)
      .expect(403);
    await request(app.getHttpServer())
      .put(`/organizations/${organizationAId}/logo`)
      .set(headers)
      .field('expectedRowState', 'ABSENT')
      .attach('file', png(64, 64), {
        filename: 'revoked.png',
        contentType: 'image/png',
      })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/organizations/${organizationAId}/logo`)
      .set(headers)
      .send({ expectedUpdatedAt: new Date().toISOString() })
      .expect(403);
  });

  it('has one canonical first-write winner and one conflict', async () => {
    const ownerToken = bearer(ownerUserId);
    const [first, second] = await Promise.all([
      upload(ownerToken, organizationBId, png(64, 64), {
        expectedRowState: 'ABSENT',
      }),
      upload(ownerToken, organizationBId, png(80, 80), {
        expectedRowState: 'ABSENT',
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(
      await prisma.organizationLogoAsset.count({
        where: { organizationId: organizationBId },
      }),
    ).toBe(1);
    const files = await readdir(
      join(uploadsPath, 'organizations', organizationBId),
    );
    expect(files).toHaveLength(1);
  });

  it('has one canonical replacement winner and one conflict', async () => {
    const ownerToken = bearer(ownerUserId);
    const current = await prisma.organizationLogoAsset.findUniqueOrThrow({
      where: { organizationId: organizationBId },
    });
    const [first, second] = await Promise.all([
      upload(ownerToken, organizationBId, png(96, 96), {
        expectedUpdatedAt: current.updatedAt.toISOString(),
      }),
      upload(ownerToken, organizationBId, png(112, 112), {
        expectedUpdatedAt: current.updatedAt.toISOString(),
      }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const canonical = await prisma.organizationLogoAsset.findUniqueOrThrow({
      where: { organizationId: organizationBId },
    });
    expect([96, 112]).toContain(canonical.width);
    const files = await readdir(
      join(uploadsPath, 'organizations', organizationBId),
    );
    expect(files).toHaveLength(1);
  });

  it('allows owner repair while suspended and resolves replacement/remove race by CAS', async () => {
    const ownerToken = bearer(ownerUserId);
    const current = await prisma.organizationLogoAsset.findUniqueOrThrow({
      where: { organizationId: organizationBId },
    });
    const [replace, remove] = await Promise.all([
      upload(ownerToken, organizationBId, png(96, 96), {
        expectedUpdatedAt: current.updatedAt.toISOString(),
      }),
      request(app.getHttpServer())
        .delete(`/organizations/${organizationBId}/logo`)
        .set('Authorization', ownerToken)
        .set('X-Organization-Id', organizationBId)
        .send({ expectedUpdatedAt: current.updatedAt.toISOString() }),
    ]);
    expect([replace.status, remove.status].sort()).toEqual([200, 409]);
    await assertCanonicalFilesystemState(organizationBId);
    await prisma.organization.update({
      where: { id: organizationBId },
      data: { status: OrganizationStatus.SUSPENDED },
    });
    await request(app.getHttpServer())
      .get(`/organizations/${organizationBId}/logo`)
      .set('Authorization', ownerToken)
      .set('X-Organization-Id', organizationBId)
      .expect(200);
    const suspendedCurrent = await prisma.organizationLogoAsset.findUnique({
      where: { organizationId: organizationBId },
    });
    if (suspendedCurrent) {
      await upload(ownerToken, organizationBId, png(100, 100), {
        expectedUpdatedAt: suspendedCurrent.updatedAt.toISOString(),
      }).expect(200);
    }
    await prisma.organization.update({
      where: { id: organizationBId },
      data: { status: OrganizationStatus.ACTIVE },
    });
  });

  function upload(
    token: string,
    organizationId: string,
    bytes: Buffer,
    precondition: Record<string, string>,
  ) {
    const requestBuilder = request(app.getHttpServer())
      .put(`/organizations/${organizationId}/logo`)
      .set('Authorization', token)
      .set('X-Organization-Id', organizationId);
    for (const [field, value] of Object.entries(precondition))
      requestBuilder.field(field, value);
    return requestBuilder.attach('file', bytes, {
      filename: 'logo.png',
      contentType: 'image/png',
    });
  }

  function bearer(userId: string) {
    return `Bearer ${jwtService.sign({ sub: userId, name: 'Logo E2E User', email: 'logo-e2e@example.test', role: UserRole.ADMIN })}`;
  }

  async function assertCanonicalFilesystemState(organizationId: string) {
    const canonical = await prisma.organizationLogoAsset.findUnique({
      where: { organizationId },
    });
    const files = await readdir(
      join(uploadsPath, 'organizations', organizationId),
    );

    if (canonical) {
      expect(files).toEqual([canonical.storageKey.split('/').at(-1)]);
    } else {
      expect(files).toEqual([]);
    }
  }

  async function organizationLogoFiles(organizationId: string) {
    try {
      return await readdir(join(uploadsPath, 'organizations', organizationId));
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return [];
      }
      throw error;
    }
  }
});

function user(id: string, email: string) {
  return {
    id,
    name: 'Logo E2E User',
    email,
    normalizedEmail: normalizeEmailIdentity(email),
    passwordHash: 'not-a-real-password',
    role: UserRole.ADMIN,
  };
}

function organization(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Logo E2E Legal Name',
    displayName: 'Logo E2E',
    status: OrganizationStatus.ACTIVE,
  };
}

function membership(
  userId: string,
  organizationId: string,
  role: MembershipRole,
  status: MembershipStatus = MembershipStatus.ACTIVE,
) {
  return {
    userId,
    organizationId,
    role,
    status,
    joinedAt: new Date(),
  };
}

function png(width: number, height: number) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 4)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngWithInvalidPayload(width: number, height: number) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', Buffer.from('not a zlib image payload')),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeBytes = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

type LogoResponse = {
  rowState: 'ABSENT' | 'PRESENT';
  updatedAt: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  storageKey?: unknown;
};
