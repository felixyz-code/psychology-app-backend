import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let service: jest.Mocked<HealthService>;

  beforeEach(async () => {
    service = {
      live: jest.fn().mockReturnValue({ status: 'UP' }),
      ready: jest.fn().mockResolvedValue({ status: 'ok', info: {} } as any),
    } as unknown as jest.Mocked<HealthService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns liveness status from health service', () => {
    const result = controller.live();
    expect(result).toEqual({ status: 'UP' });
    expect(service.live).toHaveBeenCalledTimes(1);
  });

  it('returns readiness status from health service', async () => {
    const result = await controller.ready();
    expect(result).toEqual({ status: 'ok', info: {} });
    expect(service.ready).toHaveBeenCalledTimes(1);
  });
});
