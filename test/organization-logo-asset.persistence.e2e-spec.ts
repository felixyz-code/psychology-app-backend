import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, OrganizationStatus } from '@prisma/client';

const describePersistence =
  process.env.RUN_ORGANIZATION_LOGO_ASSET_PERSISTENCE_TESTS === 'true'
    ? describe
    : describe.skip;

describePersistence('Organization logo asset persistence', () => {
  let prisma: PrismaClient;
  const databaseUrl = process.env.DATABASE_URL;
  const suffix = randomUUID();
  const existingOrganizationId = randomUUID();
  const duplicateKeyOrganizationId = randomUUID();
  const cascadeOrganizationId = randomUUID();

  beforeAll(async () => {
    if (
      !databaseUrl ||
      !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
    ) {
      throw new Error(
        'Organization logo asset persistence requires DATABASE_URL ending in _test',
      );
    }

    prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
    await prisma.$connect();
    await prisma.organization.createMany({
      data: [
        organization(existingOrganizationId, `logo-existing-${suffix}`),
        organization(
          duplicateKeyOrganizationId,
          `logo-duplicate-key-${suffix}`,
        ),
        organization(cascadeOrganizationId, `logo-cascade-${suffix}`),
      ],
    });
  });

  afterAll(async () => {
    await prisma?.organization.deleteMany({
      where: {
        id: {
          in: [
            existingOrganizationId,
            duplicateKeyOrganizationId,
            cascadeOrganizationId,
          ],
        },
      },
    });
    await prisma?.$disconnect();
  });

  it('keeps existing organizations valid without a logo row', async () => {
    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: existingOrganizationId },
        include: { logoAsset: true },
      }),
    ).resolves.toMatchObject({ logoAsset: null });
  });

  it('enforces the one-to-one organization row and unique storage key', async () => {
    const storageKey = `organizations/${existingOrganizationId}/${randomUUID()}`;
    await prisma.organizationLogoAsset.create({
      data: logoAsset(existingOrganizationId, storageKey),
    });

    await expect(
      prisma.organizationLogoAsset.create({
        data: logoAsset(
          existingOrganizationId,
          `organizations/${existingOrganizationId}/${randomUUID()}`,
        ),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      prisma.organizationLogoAsset.create({
        data: logoAsset(duplicateKeyOrganizationId, storageKey),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });

    await expect(
      prisma.organization.findUniqueOrThrow({
        where: { id: existingOrganizationId },
        include: { logoAsset: true },
      }),
    ).resolves.toMatchObject({
      logoAsset: { organizationId: existingOrganizationId, storageKey },
    });
  });

  it('cascades logo metadata when the organization row is deleted', async () => {
    const storageKey = `organizations/${cascadeOrganizationId}/${randomUUID()}`;
    await prisma.organizationLogoAsset.create({
      data: logoAsset(cascadeOrganizationId, storageKey),
    });

    await prisma.organization.delete({ where: { id: cascadeOrganizationId } });

    await expect(
      prisma.organizationLogoAsset.findUnique({
        where: { organizationId: cascadeOrganizationId },
      }),
    ).resolves.toBeNull();
  });
});

function organization(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Organization Logo Asset Test',
    displayName: 'Organization Logo Asset Test',
    status: OrganizationStatus.ACTIVE,
  };
}

function logoAsset(organizationId: string, storageKey: string) {
  return {
    organizationId,
    storageKey,
    mimeType: 'image/png',
    byteSize: 4,
    width: 1,
    height: 1,
  };
}
