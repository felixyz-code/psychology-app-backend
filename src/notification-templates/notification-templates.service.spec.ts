import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NotificationChannel, NotificationEventType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TemplateInterpolatorService } from './interpolator/template-interpolator.service';
import { NotificationTemplatesService } from './notification-templates.service';

describe('NotificationTemplatesService', () => {
  let service: NotificationTemplatesService;
  let prisma: {
    notificationTemplate: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const mockOrgId = 'org-uuid-1111-2222';
  const mockTemplate = {
    id: 'tpl-1',
    organizationId: mockOrgId,
    channel: NotificationChannel.EMAIL,
    eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
    name: 'Confirmación Email',
    subject: 'Tu cita en {{organizationName}}',
    body: 'Hola {{patientName}}, tu cita es el {{appointmentDate}}',
    variables: ['organizationName', 'patientName', 'appointmentDate'],
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      notificationTemplate: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationTemplatesService,
        TemplateInterpolatorService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<NotificationTemplatesService>(
      NotificationTemplatesService,
    );
  });

  describe('findAll', () => {
    it('returns filtered templates for the tenant', async () => {
      prisma.notificationTemplate.findMany.mockResolvedValue([mockTemplate]);

      const result = await service.findAll(
        {
          channel: NotificationChannel.EMAIL,
          eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
          isActive: true,
          search: 'cita',
        },
        mockOrgId,
      );

      expect(result).toEqual([mockTemplate]);
      expect(prisma.notificationTemplate.findMany).toHaveBeenCalledWith({
        where: {
          organizationId: mockOrgId,
          channel: NotificationChannel.EMAIL,
          eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
          isActive: true,
          OR: [
            { name: { contains: 'cita', mode: 'insensitive' } },
            { subject: { contains: 'cita', mode: 'insensitive' } },
            { body: { contains: 'cita', mode: 'insensitive' } },
          ],
        },
        orderBy: [{ channel: 'asc' }, { eventType: 'asc' }],
        take: 50,
        skip: 0,
      });
    });
  });

  describe('findOne', () => {
    it('returns the template if found for organization', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(mockTemplate);

      const result = await service.findOne('tpl-1', mockOrgId);
      expect(result).toEqual(mockTemplate);
      expect(prisma.notificationTemplate.findFirst).toHaveBeenCalledWith({
        where: { id: 'tpl-1', organizationId: mockOrgId },
      });
    });

    it('throws NotFoundException if template does not exist for organization', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(null);

      await expect(service.findOne('tpl-999', mockOrgId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('creates a new template and automatically extracts dynamic variables', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue(null);
      prisma.notificationTemplate.create.mockResolvedValue(mockTemplate);

      const result = await service.create(
        {
          channel: NotificationChannel.EMAIL,
          eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
          name: 'Confirmación Email',
          subject: 'Tu cita en {{organizationName}}',
          body: 'Hola {{patientName}}, tu cita es el {{appointmentDate}}',
        },
        mockOrgId,
      );

      expect(result).toEqual(mockTemplate);
      expect(prisma.notificationTemplate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: mockOrgId,
          channel: NotificationChannel.EMAIL,
          eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
          variables: expect.arrayContaining([
            'organizationName',
            'patientName',
            'appointmentDate',
          ]),
        }),
      });
    });

    it('throws ConflictException if a template for the same channel and eventType already exists', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue(mockTemplate);

      await expect(
        service.create(
          {
            channel: NotificationChannel.EMAIL,
            eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
            name: 'Duplicado',
            body: 'Texto',
          },
          mockOrgId,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('updates template fields and re-computes variables', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(mockTemplate);
      prisma.notificationTemplate.update.mockResolvedValue({
        ...mockTemplate,
        name: 'Nuevo Nombre',
      });

      const result = await service.update(
        'tpl-1',
        {
          name: 'Nuevo Nombre',
          body: 'Nuevo texto con {{therapistName}}',
        },
        mockOrgId,
      );

      expect(result.name).toBe('Nuevo Nombre');
      expect(prisma.notificationTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: expect.objectContaining({
          name: 'Nuevo Nombre',
          body: 'Nuevo texto con {{therapistName}}',
          variables: expect.arrayContaining(['therapistName']),
        }),
      });
    });
  });

  describe('remove', () => {
    it('deletes the template scoped to organization', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(mockTemplate);
      prisma.notificationTemplate.delete.mockResolvedValue(mockTemplate);

      const result = await service.remove('tpl-1', mockOrgId);
      expect(result.deleted).toBe(true);
      expect(prisma.notificationTemplate.delete).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
      });
    });
  });

  describe('seedDefaultsForOrganization', () => {
    it('creates default templates when none exist', async () => {
      prisma.notificationTemplate.findUnique.mockResolvedValue(null);
      prisma.notificationTemplate.create.mockResolvedValue(mockTemplate);

      const result = await service.seedDefaultsForOrganization(mockOrgId);
      expect(result.seededCount).toBeGreaterThan(0);
      expect(prisma.notificationTemplate.create).toHaveBeenCalled();
    });
  });

  describe('renderPreview', () => {
    it('renders live preview using templateId from db', async () => {
      prisma.notificationTemplate.findFirst.mockResolvedValue(mockTemplate);

      const preview = await service.renderPreview(
        {
          templateId: 'tpl-1',
          customContext: { patientName: 'Carlos Test' },
        },
        mockOrgId,
      );

      expect(preview.renderedBody).toContain('Carlos Test');
      expect(preview.channel).toBe(NotificationChannel.EMAIL);
    });

    it('renders WhatsApp appointment reminder with bold formatting, date and time', async () => {
      const preview = await service.renderPreview({
        channel: NotificationChannel.WHATSAPP,
        eventType: NotificationEventType.APPOINTMENT_REMINDER_24H,
        body: 'Hola *{{patientName}}*, le recordamos su cita mañana a las *{{appointmentTime}}* con {{therapistName}} en {{organizationName}}.',
        customContext: {
          patientName: 'Sofía Navarro',
          appointmentTime: '15:00 hrs',
          therapistName: 'Lic. Andrés Salgado',
          organizationName: 'Centro Psicológico Integral',
        },
      });

      expect(preview.renderedBody).toBe(
        'Hola *Sofía Navarro*, le recordamos su cita mañana a las *15:00 hrs* con Lic. Andrés Salgado en Centro Psicológico Integral.',
      );
      expect(preview.detectedVariables).toEqual([
        'patientName',
        'appointmentTime',
        'therapistName',
        'organizationName',
      ]);
      expect(preview.unmappedVariables).toEqual([]);
    });

    it('renders Email appointment cancellation template with context interpolation', async () => {
      const preview = await service.renderPreview({
        channel: NotificationChannel.EMAIL,
        eventType: NotificationEventType.APPOINTMENT_CANCELLED,
        subject: 'Cita Cancelada - {{organizationName}}',
        body: '<p>Estimado/a {{patientName}}, su cita del {{appointmentDate}} ha sido cancelada.</p>',
        customContext: {
          organizationName: 'PsiqueOS Clínica',
          patientName: 'Roberto & Hijos',
          appointmentDate: '26/08/2026',
        },
      });

      expect(preview.renderedSubject).toBe('Cita Cancelada - PsiqueOS Clínica');
      expect(preview.renderedBody).toContain('Roberto & Hijos');
      expect(preview.renderedBody).toContain('26/08/2026');
    });
  });

  describe('getVariablesMetadata', () => {
    it('returns the canonical list of template variables', () => {
      const vars = service.getVariablesMetadata();
      expect(vars.length).toBeGreaterThan(0);
    });
  });
});
