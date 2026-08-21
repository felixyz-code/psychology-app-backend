import { ScheduleBlocksController } from './schedule-blocks.controller';
import { ScheduleBlocksService } from './schedule-blocks.service';

describe('ScheduleBlocksController', () => {
  let controller: ScheduleBlocksController;
  let service: {
    create: jest.Mock;
    findAll: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };

  const user = {
    id: 'user-id',
    email: 'user@example.com',
    role: 'PSYCHOLOGIST',
  } as any;

  const tenant = {
    organizationId: 'org-id',
    membershipId: 'mem-id',
    organizationRole: 'PSYCHOLOGIST',
    legacyUserRole: 'PSYCHOLOGIST',
    resolutionMode: 'EXPLICIT',
  } as any;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      remove: jest.fn(),
    };
    controller = new ScheduleBlocksController(
      service as unknown as ScheduleBlocksService,
    );
  });

  it('delegates create to service', async () => {
    const dto = {
      title: 'Training',
      startTime: '2026-08-25T10:00:00.000Z',
      endTime: '2026-08-25T12:00:00.000Z',
    };
    service.create.mockResolvedValue({ id: 'block-1', ...dto });

    const result = await controller.create(dto, user, tenant);
    expect(service.create).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({ organizationId: 'org-id', userId: 'user-id' }),
    );
    expect(result.id).toBe('block-1');
  });

  it('delegates findAll to service', async () => {
    service.findAll.mockResolvedValue([]);
    const query = { therapistId: 'user-id' };

    const result = await controller.findAll(query, user, tenant);
    expect(service.findAll).toHaveBeenCalledWith(
      query,
      expect.objectContaining({ organizationId: 'org-id' }),
    );
    expect(result).toEqual([]);
  });

  it('delegates findOne to service', async () => {
    service.findOne.mockResolvedValue({ id: 'block-1' });

    const result = await controller.findOne('block-1', user, tenant);
    expect(service.findOne).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({ organizationId: 'org-id' }),
    );
    expect(result.id).toBe('block-1');
  });

  it('delegates remove to service', async () => {
    service.remove.mockResolvedValue({ id: 'block-1' });

    const result = await controller.remove('block-1', user, tenant);
    expect(service.remove).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({ organizationId: 'org-id' }),
    );
    expect(result.id).toBe('block-1');
  });
});
