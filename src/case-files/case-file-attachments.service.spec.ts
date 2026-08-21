import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AttachmentCategory } from '@prisma/client';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { ClinicalAccessPolicyService } from '../tenant-context/clinical-access-policy.service';
import type { ClinicalAccessScope } from '../tenant-context/clinical-access.types';
import { CaseFileAttachmentsService } from './case-file-attachments.service';

describe('CaseFileAttachmentsService', () => {
  let service: CaseFileAttachmentsService;
  let prisma: {
    caseFile: { findFirst: jest.Mock };
    caseFileAttachment: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      deleteMany: jest.Mock;
    };
    patient: { findFirst: jest.Mock };
    patientAssignment: { findFirst: jest.Mock };
  };
  let config: { uploadsPath: string };
  let clinicalPolicy: {
    requireCapability: jest.Mock;
    tenantPatientWhere: jest.Mock;
    assignedPatientWhere: jest.Mock;
    assignmentWhere: jest.Mock;
  };

  const scope: ClinicalAccessScope = {
    organizationId: 'org-id',
    membershipId: 'membership-id',
    organizationRole: 'PSYCHOLOGIST' as any,
    userId: 'user-id',
    legacyUserRole: 'PSYCHOLOGIST' as any,
    resolutionMode: 'EXPLICIT' as any,
  };

  const caseFileId = 'case-file-id';
  const patientId = 'patient-id';
  const attachmentId = 'attachment-id';

  beforeEach(() => {
    prisma = {
      caseFile: {
        findFirst: jest.fn().mockResolvedValue({ id: caseFileId, patientId }),
      },
      caseFileAttachment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        deleteMany: jest.fn(),
      },
      patient: {
        findFirst: jest.fn().mockResolvedValue({ id: patientId }),
      },
      patientAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'assignment-id' }),
      },
    };

    config = {
      uploadsPath: 'test-uploads',
    };

    clinicalPolicy = {
      requireCapability: jest.fn(),
      tenantPatientWhere: jest.fn().mockReturnValue({}),
      assignedPatientWhere: jest.fn().mockReturnValue({}),
      assignmentWhere: jest.fn().mockReturnValue({}),
    };

    service = new CaseFileAttachmentsService(
      prisma as unknown as PrismaService,
      config as unknown as AppConfigService,
      clinicalPolicy as unknown as ClinicalAccessPolicyService,
    );
  });

  describe('upload', () => {
    it('uploads an attachment and creates a database record', async () => {
      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'study.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 20,
        buffer: Buffer.from('%PDF-1.4 sample pdf content'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      const mockCreated = {
        id: attachmentId,
        caseFileId,
        organizationId: scope.organizationId,
        uploadedById: scope.userId,
        fileName: 'uuid.pdf',
        originalName: 'study.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 20,
        category: AttachmentCategory.ESTUDIO_PREVIO,
        notes: 'Estudio de neurofeedback',
        filePath: `patients/${patientId}/attachments/uuid.pdf`,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      prisma.caseFileAttachment.create.mockResolvedValue(mockCreated);

      const result = await service.upload(
        caseFileId,
        {
          category: AttachmentCategory.ESTUDIO_PREVIO,
          notes: 'Estudio de neurofeedback',
        },
        mockFile,
        scope,
      );

      expect(clinicalPolicy.requireCapability).toHaveBeenCalled();
      expect(prisma.caseFileAttachment.create).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(attachmentId);
    });

    it('throws NotFoundException if case file does not exist', async () => {
      prisma.caseFile.findFirst.mockResolvedValue(null);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'study.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 20,
        buffer: Buffer.from('%PDF-1.4 sample'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(
        service.upload(
          caseFileId,
          { category: AttachmentCategory.OTRO },
          mockFile,
          scope,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if non-exempt user is not assigned to the patient', async () => {
      prisma.patientAssignment.findFirst.mockResolvedValue(null);

      const mockFile: Express.Multer.File = {
        fieldname: 'file',
        originalname: 'study.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 20,
        buffer: Buffer.from('%PDF-1.4 sample'),
        destination: '',
        filename: '',
        path: '',
        stream: null as any,
      };

      await expect(
        service.upload(
          caseFileId,
          { category: AttachmentCategory.OTRO },
          mockFile,
          scope,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findByCaseFileId', () => {
    it('returns attachments for visible case file', async () => {
      const attachments = [
        {
          id: attachmentId,
          caseFileId,
          fileName: 'study.pdf',
          category: AttachmentCategory.ESTUDIO_PREVIO,
        },
      ];

      prisma.caseFileAttachment.findMany.mockResolvedValue(attachments);

      const result = await service.findByCaseFileId(caseFileId, scope);

      expect(prisma.caseFileAttachment.findMany).toHaveBeenCalledWith({
        where: {
          caseFileId,
          organizationId: scope.organizationId,
        },
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
      expect(result).toEqual(attachments);
    });
  });

  describe('remove', () => {
    it('removes attachment from DB and files', async () => {
      const attachment = {
        id: attachmentId,
        caseFileId,
        filePath: `patients/${patientId}/attachments/file.pdf`,
        caseFile: { patientId },
      };

      prisma.caseFileAttachment.findFirst.mockResolvedValue(attachment);
      prisma.caseFileAttachment.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.remove(caseFileId, attachmentId, scope);

      expect(prisma.caseFileAttachment.deleteMany).toHaveBeenCalledTimes(1);
      expect(result.id).toBe(attachmentId);
    });

    it('throws NotFoundException if attachment does not exist', async () => {
      prisma.caseFileAttachment.findFirst.mockResolvedValue(null);

      await expect(
        service.remove(caseFileId, attachmentId, scope),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
