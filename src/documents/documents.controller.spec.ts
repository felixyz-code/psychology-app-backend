import { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { MembershipRole, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

const caseFileId = '550e8400-e29b-41d4-a716-446655440000';

const authenticatedUser: AuthenticatedUser = {
  id: 'user-id',
  name: 'Psychologist',
  email: 'psychologist@example.com',
  role: UserRole.PSYCHOLOGIST,
};

const tenantContext: TenantContext = {
  organizationId: '550e8400-e29b-41d4-a716-446655440001',
  membershipId: '550e8400-e29b-41d4-a716-446655440002',
  organizationRole: MembershipRole.PSYCHOLOGIST,
  legacyUserRole: UserRole.PSYCHOLOGIST,
  userId: authenticatedUser.id,
  resolutionMode: TenantResolutionMode.EXPLICIT,
};

type RequestWithUser = {
  user?: AuthenticatedUser;
  tenantContext?: TenantContext;
};

describe('DocumentsController', () => {
  let app: INestApplication<App>;
  let documentsService: Pick<jest.Mocked<DocumentsService>, 'upload'>;

  beforeEach(async () => {
    documentsService = {
      upload: jest.fn(),
    };

    const authGuard = {
      canActivate: (context: ExecutionContext) => {
        const httpRequest = context
          .switchToHttp()
          .getRequest<RequestWithUser>();
        httpRequest.user = authenticatedUser;
        httpRequest.tenantContext = tenantContext;

        return true;
      },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DocumentsController],
      providers: [
        {
          provide: DocumentsService,
          useValue: documentsService,
        },
        {
          provide: APP_GUARD,
          useValue: authGuard,
        },
        {
          provide: APP_GUARD,
          useValue: { canActivate: () => true },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('accepts a valid multipart upload using the file field and caseFileId metadata', async () => {
    documentsService.upload.mockResolvedValue({
      id: 'document-id',
      organizationId: null,
      caseFileId,
      uploadedById: authenticatedUser.id,
      fileName: 'consent.pdf',
      filePath: 'patients/patient-id/document-id.pdf',
      mimeType: 'application/pdf',
      uploadedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await request(app.getHttpServer())
      .post('/documents/upload')
      .field('caseFileId', caseFileId)
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'consent.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);

    expect(documentsService.upload).toHaveBeenCalledTimes(1);

    const [uploadDocumentDto, file, scope] =
      documentsService.upload.mock.calls[0];

    expect(uploadDocumentDto).toMatchObject({ caseFileId });
    expect(file.fieldname).toBe('file');
    expect(file.originalname).toBe('consent.pdf');
    expect(file.mimetype).toBe('application/pdf');
    expect(file.buffer).toEqual(Buffer.from('%PDF-1.4'));
    expect(scope).toEqual({
      organizationId: tenantContext.organizationId,
      membershipId: tenantContext.membershipId,
      organizationRole: tenantContext.organizationRole,
      legacyUserRole: tenantContext.legacyUserRole,
      userId: authenticatedUser.id,
      resolutionMode: tenantContext.resolutionMode,
    });
  });

  it('rejects upload requests without a file', async () => {
    await request(app.getHttpServer())
      .post('/documents/upload')
      .field('caseFileId', caseFileId)
      .expect(400);

    expect(documentsService.upload).not.toHaveBeenCalled();
  });

  it('rejects upload requests with unsupported MIME type or extension', async () => {
    await request(app.getHttpServer())
      .post('/documents/upload')
      .field('caseFileId', caseFileId)
      .attach('file', Buffer.from('plain text'), {
        filename: 'notes.txt',
        contentType: 'text/plain',
      })
      .expect(400);

    expect(documentsService.upload).not.toHaveBeenCalled();
  });

  it('rejects files larger than 10 MB', async () => {
    await request(app.getHttpServer())
      .post('/documents/upload')
      .field('caseFileId', caseFileId)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: 'oversized.pdf',
        contentType: 'application/pdf',
      })
      .expect(413);

    expect(documentsService.upload).not.toHaveBeenCalled();
  });
});
