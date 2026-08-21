import { ExecutionContext, INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AttachmentCategory, MembershipRole, UserRole } from '@prisma/client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { TenantResolutionMode } from '../common/request-context/request-context.service';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import { CaseFileAttachmentsController } from './case-file-attachments.controller';
import { CaseFileAttachmentsService } from './case-file-attachments.service';

const caseFileId = '550e8400-e29b-41d4-a716-446655440000';
const attachmentId = '550e8400-e29b-41d4-a716-446655440099';

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

describe('CaseFileAttachmentsController', () => {
  let app: INestApplication<App>;
  let attachmentsService: jest.Mocked<CaseFileAttachmentsService>;

  beforeEach(async () => {
    attachmentsService = {
      upload: jest.fn(),
      findByCaseFileId: jest.fn(),
      getDownloadFile: jest.fn(),
      getViewFile: jest.fn(),
      remove: jest.fn(),
    } as unknown as jest.Mocked<CaseFileAttachmentsService>;

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
      controllers: [CaseFileAttachmentsController],
      providers: [
        {
          provide: CaseFileAttachmentsService,
          useValue: attachmentsService,
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

  it('accepts a valid attachment upload', async () => {
    const mockResult = {
      id: attachmentId,
      caseFileId,
      organizationId: tenantContext.organizationId,
      uploadedById: authenticatedUser.id,
      fileName: 'uuid-file.pdf',
      originalName: 'test-study.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      category: AttachmentCategory.ESTUDIO_PREVIO,
      notes: 'Estudio neurológico',
      filePath: 'patients/p1/attachments/uuid-file.pdf',
      createdAt: new Date(),
      updatedAt: new Date(),
      uploadedBy: {
        id: authenticatedUser.id,
        name: authenticatedUser.name,
        email: authenticatedUser.email,
      },
    };

    attachmentsService.upload.mockResolvedValue(mockResult);

    const response = await request(app.getHttpServer())
      .post(`/case-files/${caseFileId}/attachments`)
      .field('category', 'ESTUDIO_PREVIO')
      .field('notes', 'Estudio neurológico')
      .attach('file', Buffer.from('%PDF-1.4 sample'), {
        filename: 'test-study.pdf',
        contentType: 'application/pdf',
      });

    expect(response.status).toBe(201);
    expect(attachmentsService.upload).toHaveBeenCalledTimes(1);
  });

  it('rejects uploads with unsupported extensions or mimetypes', async () => {
    const response = await request(app.getHttpServer())
      .post(`/case-files/${caseFileId}/attachments`)
      .attach('file', Buffer.from('console.log("bad");'), {
        filename: 'evil.js',
        contentType: 'application/javascript',
      });

    expect(response.status).toBe(400);
    expect(attachmentsService.upload).not.toHaveBeenCalled();
  });

  it('lists attachments of a case file', async () => {
    const mockList = [
      {
        id: attachmentId,
        caseFileId,
        organizationId: tenantContext.organizationId,
        uploadedById: authenticatedUser.id,
        fileName: 'uuid.pdf',
        originalName: 'report.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
        category: AttachmentCategory.REPORTE_ESCOLAR,
        notes: null,
        filePath: 'patients/p1/attachments/uuid.pdf',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    attachmentsService.findByCaseFileId.mockResolvedValue(mockList as any);

    const response = await request(app.getHttpServer())
      .get(`/case-files/${caseFileId}/attachments`);

    expect(response.status).toBe(200);
    expect(attachmentsService.findByCaseFileId).toHaveBeenCalledTimes(1);
    expect(response.body).toHaveLength(1);
  });

  it('deletes an attachment', async () => {
    const mockDeleted = {
      id: attachmentId,
      caseFileId,
      organizationId: tenantContext.organizationId,
      uploadedById: authenticatedUser.id,
      fileName: 'uuid.pdf',
      originalName: 'report.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      category: AttachmentCategory.IDENTIFICACION,
      notes: null,
      filePath: 'patients/p1/attachments/uuid.pdf',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    attachmentsService.remove.mockResolvedValue(mockDeleted as any);

    const response = await request(app.getHttpServer())
      .delete(`/case-files/${caseFileId}/attachments/${attachmentId}`);

    expect(response.status).toBe(200);
    expect(attachmentsService.remove).toHaveBeenCalledTimes(1);
  });
});
