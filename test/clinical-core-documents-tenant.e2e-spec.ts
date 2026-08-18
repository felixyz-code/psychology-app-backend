import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PatientAssignmentRole,
  PatientAssignmentStatus,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { normalizeEmailIdentity } from '../src/common/identity/email-identity.util';
import { AppModule } from '../src/app.module';

const describeCertification =
  process.env.RUN_CLINICAL_CORE_DOCUMENTS_TENANT_CERTIFICATION_TESTS === 'true'
    ? describe
    : describe.skip;

describeCertification(
  'Clinical core and documents tenant-aware HTTP certification',
  () => {
    let app: INestApplication<App>;
    let prisma: PrismaClient;
    let jwtService: JwtService;
    let uploadsPath: string;
    const databaseUrl = process.env.DATABASE_URL;
    const suffix = randomUUID();
    const organizationAId = randomUUID();
    const organizationBId = randomUUID();
    const membershipAId = randomUUID();
    const membershipBId = randomUUID();
    const membershipAuditorAId = randomUUID();
    const psychologistAId = randomUUID();
    const psychologistBId = randomUUID();
    const auditorAId = randomUUID();
    const patientAId = randomUUID();
    const patientBId = randomUUID();
    const patientLegacyId = randomUUID();
    const patientUnassignedId = randomUUID();
    const caseFileAId = randomUUID();
    const caseFileBId = randomUUID();
    const caseFileLegacyId = randomUUID();
    const caseFileUnassignedId = randomUUID();
    const sessionNoteAId = randomUUID();
    const sessionNoteBId = randomUUID();
    const sessionNoteLegacyId = randomUUID();
    const sessionNoteUnassignedId = randomUUID();
    const documentAId = randomUUID();
    const documentBId = randomUUID();
    const documentLegacyId = randomUUID();
    const documentUnassignedId = randomUUID();
    const createdSessionNoteIds: string[] = [];
    const createdDocumentIds: string[] = [];

    beforeAll(async () => {
      if (
        !databaseUrl ||
        !new URL(databaseUrl).pathname.slice(1).endsWith('_test')
      ) {
        throw new Error(
          'Clinical core tenant certification requires DATABASE_URL ending in _test',
        );
      }

      uploadsPath = await mkdtemp(join(tmpdir(), 'psychology-d2-uploads-'));
      process.env.DATABASE_URL = databaseUrl;
      process.env.UPLOADS_PATH = uploadsPath;
      process.env.JWT_SECRET = 'Qx7Za9Lp4Vm2Kr8Nj5Hs6Dt3Bw1Cy0Fu7Eg9Ra2';
      prisma = new PrismaClient({ adapter: new PrismaPg(databaseUrl) });
      await prisma.$connect();
      await seedFixture();

      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      jwtService = moduleRef.get(JwtService);
    });

    afterAll(async () => {
      await app?.close();
      await prisma?.document.deleteMany({
        where: {
          id: {
            in: [
              documentAId,
              documentBId,
              documentLegacyId,
              documentUnassignedId,
              ...createdDocumentIds,
            ],
          },
        },
      });
      await prisma?.sessionNote.deleteMany({
        where: {
          id: {
            in: [
              sessionNoteAId,
              sessionNoteBId,
              sessionNoteLegacyId,
              sessionNoteUnassignedId,
              ...createdSessionNoteIds,
            ],
          },
        },
      });
      await prisma?.caseFile.deleteMany({
        where: {
          id: {
            in: [
              caseFileAId,
              caseFileBId,
              caseFileLegacyId,
              caseFileUnassignedId,
            ],
          },
        },
      });
      await prisma?.patientAssignment.deleteMany({
        where: { patientId: { in: [patientAId, patientBId, patientLegacyId] } },
      });
      await prisma?.patient.deleteMany({
        where: {
          id: {
            in: [patientAId, patientBId, patientLegacyId, patientUnassignedId],
          },
        },
      });
      await prisma?.organizationMembership.deleteMany({
        where: {
          userId: { in: [psychologistAId, psychologistBId, auditorAId] },
        },
      });
      await prisma?.organization.deleteMany({
        where: { id: { in: [organizationAId, organizationBId] } },
      });
      await prisma?.user.deleteMany({
        where: {
          id: { in: [psychologistAId, psychologistBId, auditorAId] },
        },
      });
      await prisma?.$disconnect();
      await rm(uploadsPath, { recursive: true, force: true });
    });

    it('isolates case files, workspace relations, and legacy NULL records', async () => {
      const tokenA = bearerToken(psychologistAId);
      const listed = await request(app.getHttpServer())
        .get('/case-files')
        .set('Authorization', tokenA)
        .expect(200);
      expect(ids(listed.body)).toEqual([caseFileAId]);

      await request(app.getHttpServer())
        .get(`/case-files/${caseFileBId}`)
        .set('Authorization', tokenA)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/case-files/${caseFileLegacyId}`)
        .set('Authorization', tokenA)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/case-files/${caseFileUnassignedId}`)
        .set('Authorization', tokenA)
        .expect(403);

      const workspace = await request(app.getHttpServer())
        .get(`/case-files/${caseFileAId}/workspace`)
        .set('Authorization', tokenA)
        .expect(200);
      const workspaceBody = workspace.body as {
        sessionNotes: unknown;
        documents: unknown;
      };
      expect(ids(workspaceBody.sessionNotes)).toEqual([sessionNoteAId]);
      expect(ids(workspaceBody.documents)).toEqual([documentAId]);

      await request(app.getHttpServer())
        .patch(`/case-files/${caseFileBId}`)
        .set('Authorization', tokenA)
        .send({ diagnosis: 'Blocked' })
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/case-files/${caseFileAId}`)
        .set('Authorization', tokenA)
        .send({ diagnosis: 'Updated diagnosis' })
        .expect(200);
      const updated = await prisma.caseFile.findUniqueOrThrow({
        where: { id: caseFileAId },
      });
      expect(updated).toMatchObject({
        organizationId: organizationAId,
        diagnosis: 'Updated diagnosis',
      });
    });

    it('isolates session notes and stamps server-side tenant and author fields', async () => {
      const tokenA = bearerToken(psychologistAId);
      const listed = await request(app.getHttpServer())
        .get('/session-notes')
        .set('Authorization', tokenA)
        .expect(200);
      expect(ids(listed.body)).toEqual([sessionNoteAId]);

      await request(app.getHttpServer())
        .get(`/session-notes/${sessionNoteBId}`)
        .set('Authorization', tokenA)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/session-notes/${sessionNoteLegacyId}`)
        .set('Authorization', tokenA)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/session-notes/${sessionNoteUnassignedId}`)
        .set('Authorization', tokenA)
        .expect(403);

      const created = await request(app.getHttpServer())
        .post('/session-notes')
        .set('Authorization', tokenA)
        .send({
          caseFileId: caseFileAId,
          authorId: psychologistBId,
          organizationId: organizationBId,
          title: 'Tenant-stamped note',
          content: 'Clinical content',
          sessionDate: '2026-01-05T00:00:00.000Z',
        })
        .expect(201);
      const createdId = id(created.body);
      createdSessionNoteIds.push(createdId);
      const persisted = await prisma.sessionNote.findUniqueOrThrow({
        where: { id: createdId },
      });
      expect(persisted).toMatchObject({
        organizationId: organizationAId,
        authorId: psychologistAId,
      });
    });

    it('isolates document metadata and blob access', async () => {
      const tokenA = bearerToken(psychologistAId);
      const listed = await request(app.getHttpServer())
        .get('/documents')
        .set('Authorization', tokenA)
        .expect(200);
      expect(ids(listed.body)).toEqual([documentAId]);

      await request(app.getHttpServer())
        .get(`/documents/${documentBId}`)
        .set('Authorization', tokenA)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/documents/${documentLegacyId}`)
        .set('Authorization', tokenA)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/documents/${documentUnassignedId}`)
        .set('Authorization', tokenA)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/documents/${documentBId}/download`)
        .set('Authorization', tokenA)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/documents/${documentAId}/download`)
        .set('Authorization', tokenA)
        .expect(200)
        .expect('Content-Type', /application\/pdf/);

      const uploaded = await request(app.getHttpServer())
        .post('/documents/upload')
        .set('Authorization', tokenA)
        .field('caseFileId', caseFileAId)
        .attach('file', Buffer.from('%PDF-1.7'), {
          filename: 'uploaded.pdf',
          contentType: 'application/pdf',
        })
        .expect(201);
      const uploadedId = id(uploaded.body);
      createdDocumentIds.push(uploadedId);
      const persistedUpload = await prisma.document.findUniqueOrThrow({
        where: { id: uploadedId },
      });
      expect(persistedUpload).toMatchObject({
        organizationId: organizationAId,
        uploadedById: psychologistAId,
      });

      await request(app.getHttpServer())
        .patch(`/documents/${uploadedId}`)
        .set('Authorization', tokenA)
        .send({
          fileName: 'renamed.pdf',
          organizationId: organizationBId,
          uploadedById: psychologistBId,
        })
        .expect(200);
      const persistedPatch = await prisma.document.findUniqueOrThrow({
        where: { id: uploadedId },
      });
      expect(persistedPatch).toMatchObject({
        fileName: 'renamed.pdf',
        organizationId: organizationAId,
        uploadedById: psychologistAId,
      });

      await request(app.getHttpServer())
        .delete(`/documents/${uploadedId}`)
        .set('Authorization', tokenA)
        .expect(200);
      expect(
        await prisma.document.findUnique({ where: { id: uploadedId } }),
      ).toBeNull();
    });

    it('denies clinical core and document capabilities to auditor memberships', async () => {
      const auditorToken = bearerToken(auditorAId);
      await request(app.getHttpServer())
        .get('/case-files')
        .set('Authorization', auditorToken)
        .expect(403);
      await request(app.getHttpServer())
        .get('/session-notes')
        .set('Authorization', auditorToken)
        .expect(403);
      await request(app.getHttpServer())
        .get('/documents')
        .set('Authorization', auditorToken)
        .expect(403);
    });

    function bearerToken(userId: string) {
      return `Bearer ${jwtService.sign({
        sub: userId,
        name: 'Clinical Tenant Test User',
        email: 'clinical-tenant@example.test',
        role: UserRole.PSYCHOLOGIST,
      })}`;
    }

    async function seedFixture() {
      await prisma.user.createMany({
        data: [
          user(psychologistAId, `clinical-a-${suffix}@example.test`),
          user(psychologistBId, `clinical-b-${suffix}@example.test`),
          user(auditorAId, `clinical-auditor-${suffix}@example.test`),
        ],
      });
      await prisma.organization.createMany({
        data: [
          organization(organizationAId, `clinical-a-${suffix}`),
          organization(organizationBId, `clinical-b-${suffix}`),
        ],
      });
      await prisma.organizationMembership.createMany({
        data: [
          membership(membershipAId, psychologistAId, organizationAId),
          membership(membershipBId, psychologistBId, organizationBId),
          membership(
            membershipAuditorAId,
            auditorAId,
            organizationAId,
            MembershipRole.AUDITOR,
          ),
        ],
      });
      await prisma.patient.createMany({
        data: [
          patient(patientAId, organizationAId, psychologistAId, 'A'),
          patient(patientBId, organizationBId, psychologistBId, 'B'),
          patient(patientLegacyId, null, psychologistAId, 'Legacy'),
          patient(
            patientUnassignedId,
            organizationAId,
            psychologistAId,
            'Unassigned',
          ),
        ],
      });
      await prisma.patientAssignment.createMany({
        data: [
          assignment(organizationAId, patientAId, membershipAId),
          assignment(organizationBId, patientBId, membershipBId),
          assignment(organizationAId, patientLegacyId, membershipAId),
        ],
      });
      await prisma.caseFile.createMany({
        data: [
          caseFile(caseFileAId, organizationAId, patientAId),
          caseFile(caseFileBId, organizationBId, patientBId),
          caseFile(caseFileLegacyId, null, patientLegacyId),
          caseFile(caseFileUnassignedId, organizationAId, patientUnassignedId),
        ],
      });
      await prisma.sessionNote.createMany({
        data: [
          sessionNote(
            sessionNoteAId,
            organizationAId,
            caseFileAId,
            psychologistAId,
          ),
          sessionNote(
            sessionNoteBId,
            organizationBId,
            caseFileBId,
            psychologistBId,
          ),
          sessionNote(
            sessionNoteLegacyId,
            null,
            caseFileLegacyId,
            psychologistAId,
          ),
          sessionNote(
            sessionNoteUnassignedId,
            organizationAId,
            caseFileUnassignedId,
            psychologistAId,
          ),
        ],
      });
      await mkdir(join(uploadsPath, 'patients', patientAId), {
        recursive: true,
      });
      await writeFile(blobPath(patientAId, 'document-a.pdf'), '%PDF-1.7', {
        flag: 'w',
      });
      await prisma.document.createMany({
        data: [
          document(
            documentAId,
            organizationAId,
            caseFileAId,
            patientAId,
            'document-a.pdf',
          ),
          document(
            documentBId,
            organizationBId,
            caseFileBId,
            patientBId,
            'document-b.pdf',
          ),
          document(
            documentLegacyId,
            null,
            caseFileLegacyId,
            patientLegacyId,
            'legacy.pdf',
          ),
          document(
            documentUnassignedId,
            organizationAId,
            caseFileUnassignedId,
            patientUnassignedId,
            'unassigned.pdf',
          ),
        ],
      });
    }

    function blobPath(patientId: string, fileName: string) {
      return join(uploadsPath, 'patients', patientId, fileName);
    }

    function document(
      id: string,
      organizationId: string | null,
      caseFileId: string,
      patientId: string,
      fileName: string,
    ) {
      return {
        id,
        organizationId,
        caseFileId,
        uploadedById: psychologistAId,
        fileName,
        filePath: relative(uploadsPath, blobPath(patientId, fileName)),
        mimeType: 'application/pdf',
      };
    }
  },
);

function user(id: string, email: string) {
  return {
    id,
    name: 'Clinical Tenant Test User',
    email,
    normalizedEmail: normalizeEmailIdentity(email),
    passwordHash: 'not-a-real-password',
    role: UserRole.PSYCHOLOGIST,
  };
}

function organization(id: string, slug: string) {
  return {
    id,
    slug,
    legalName: 'Clinical Tenant Test Organization',
    displayName: 'Clinical Tenant Test',
    status: OrganizationStatus.ACTIVE,
  };
}

function membership(
  id: string,
  userId: string,
  organizationId: string,
  role: MembershipRole = MembershipRole.PSYCHOLOGIST,
) {
  return {
    id,
    userId,
    organizationId,
    role,
    status: MembershipStatus.ACTIVE,
    joinedAt: new Date(),
  };
}

function assignment(
  organizationId: string,
  patientId: string,
  membershipId: string,
) {
  return {
    organizationId,
    patientId,
    membershipId,
    role: PatientAssignmentRole.PRIMARY,
    status: PatientAssignmentStatus.ACTIVE,
    createdByMembershipId: membershipId,
  };
}

function patient(
  id: string,
  organizationId: string | null,
  psychologistId: string,
  firstName: string,
) {
  return {
    id,
    organizationId,
    psychologistId,
    firstName,
    lastName: 'Patient',
  };
}

function caseFile(
  id: string,
  organizationId: string | null,
  patientId: string,
) {
  return {
    id,
    organizationId,
    patientId,
    diagnosis: 'Initial',
    treatmentPlan: 'Plan',
  };
}

function sessionNote(
  id: string,
  organizationId: string | null,
  caseFileId: string,
  authorId: string,
) {
  return {
    id,
    organizationId,
    caseFileId,
    authorId,
    sessionDate: new Date('2026-01-01T00:00:00.000Z'),
    title: 'Seed note',
    content: 'Seed content',
  };
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error('Expected an array response');
  }

  return value.map(id);
}

function id(value: unknown): string {
  if (!isRecord(value) || typeof value.id !== 'string') {
    throw new Error('Expected response with id');
  }

  return value.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
