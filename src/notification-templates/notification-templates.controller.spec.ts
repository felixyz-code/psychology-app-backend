import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipRole,
  NotificationChannel,
  NotificationEventType,
  UserRole,
} from '@prisma/client';
import {
  TenantResolutionMode,
  type TenantContext,
} from '../common/request-context/request-context.service';
import { QuotaEnforcementService } from '../billing/services/quota-enforcement.service';
import { NotificationTemplatesController } from './notification-templates.controller';
import { NotificationTemplatesService } from './notification-templates.service';

describe('NotificationTemplatesController', () => {
  let controller: NotificationTemplatesController;
  let service: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    seedDefaultsForOrganization: jest.Mock;
    renderPreview: jest.Mock;
    getVariablesMetadata: jest.Mock;
  };
  let quotaService: {
    assertCanSendNotification: jest.Mock;
  };

  const mockTenant: TenantContext = {
    organizationId: 'org-uuid-1111',
    membershipId: 'mem-uuid-2222',
    organizationRole: MembershipRole.ADMIN,
    userId: 'user-uuid-3333',
    legacyUserRole: UserRole.ADMIN,
    resolutionMode: TenantResolutionMode.EXPLICIT,
  };

  const mockTemplateResponse = {
    id: 'tpl-uuid-4444',
    organizationId: 'org-uuid-1111',
    channel: NotificationChannel.WHATSAPP,
    eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
    name: 'Confirmación WhatsApp',
    body: 'Hola {{patientName}}',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      seedDefaultsForOrganization: jest.fn(),
      renderPreview: jest.fn(),
      getVariablesMetadata: jest.fn(),
    };
    quotaService = {
      assertCanSendNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationTemplatesController],
      providers: [
        { provide: NotificationTemplatesService, useValue: service },
        { provide: QuotaEnforcementService, useValue: quotaService },
      ],
    }).compile();

    controller = module.get<NotificationTemplatesController>(
      NotificationTemplatesController,
    );
  });

  it('delegates findAll to service with tenant organizationId', async () => {
    service.findAll.mockResolvedValue([mockTemplateResponse]);

    const result = await controller.findAll(
      { channel: NotificationChannel.WHATSAPP },
      mockTenant,
    );

    expect(result).toEqual([mockTemplateResponse]);
    expect(service.findAll).toHaveBeenCalledWith(
      { channel: NotificationChannel.WHATSAPP },
      'org-uuid-1111',
    );
  });

  it('delegates findOne to service with tenant organizationId', async () => {
    service.findOne.mockResolvedValue(mockTemplateResponse);

    const result = await controller.findOne('tpl-uuid-4444', mockTenant);

    expect(result).toEqual(mockTemplateResponse);
    expect(service.findOne).toHaveBeenCalledWith(
      'tpl-uuid-4444',
      'org-uuid-1111',
    );
  });

  it('delegates create to service with tenant organizationId', async () => {
    service.create.mockResolvedValue(mockTemplateResponse);

    const dto = {
      channel: NotificationChannel.WHATSAPP,
      eventType: NotificationEventType.APPOINTMENT_CONFIRMATION,
      name: 'Confirmación WhatsApp',
      body: 'Hola {{patientName}}',
    };

    const result = await controller.create(dto, mockTenant);

    expect(result).toEqual(mockTemplateResponse);
    expect(service.create).toHaveBeenCalledWith(dto, 'org-uuid-1111');
  });

  it('delegates update to service with tenant organizationId', async () => {
    service.update.mockResolvedValue({
      ...mockTemplateResponse,
      name: 'Nombre Editado',
    });

    const result = await controller.update(
      'tpl-uuid-4444',
      { name: 'Nombre Editado' },
      mockTenant,
    );

    expect(result.name).toBe('Nombre Editado');
    expect(service.update).toHaveBeenCalledWith(
      'tpl-uuid-4444',
      { name: 'Nombre Editado' },
      'org-uuid-1111',
    );
  });

  it('delegates remove to service with tenant organizationId', async () => {
    service.remove.mockResolvedValue({ id: 'tpl-uuid-4444', deleted: true });

    const result = await controller.remove('tpl-uuid-4444', mockTenant);

    expect(result).toEqual({ id: 'tpl-uuid-4444', deleted: true });
    expect(service.remove).toHaveBeenCalledWith(
      'tpl-uuid-4444',
      'org-uuid-1111',
    );
  });

  it('delegates seedDefaults to service', async () => {
    service.seedDefaultsForOrganization.mockResolvedValue({ seededCount: 15 });

    const result = await controller.seedDefaults(mockTenant);

    expect(result).toEqual({ seededCount: 15 });
    expect(service.seedDefaultsForOrganization).toHaveBeenCalledWith(
      'org-uuid-1111',
    );
  });

  it('delegates renderPreview to service', async () => {
    const previewResult = {
      renderedBody: 'Hola Ana',
      channel: NotificationChannel.WHATSAPP,
    };
    service.renderPreview.mockResolvedValue(previewResult);

    const result = await controller.renderPreview(
      { body: 'Hola {{patientName}}' },
      mockTenant,
    );

    expect(result).toEqual(previewResult);
    expect(service.renderPreview).toHaveBeenCalledWith(
      { body: 'Hola {{patientName}}' },
      'org-uuid-1111',
    );
  });

  it('delegates getVariables to service', () => {
    service.getVariablesMetadata.mockReturnValue([
      { key: 'patientName', label: 'Nombre' },
    ]);

    const result = controller.getVariables();

    expect(result).toEqual([{ key: 'patientName', label: 'Nombre' }]);
    expect(service.getVariablesMetadata).toHaveBeenCalled();
  });
});
