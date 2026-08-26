import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let service: jest.Mocked<MetricsService>;

  beforeEach(async () => {
    service = {
      recordHttpRequest: jest.fn(),
      getMetrics: jest
        .fn()
        .mockReturnValue(
          '# HELP process_uptime_seconds The process uptime in seconds.\nprocess_uptime_seconds 10.000\n',
        ),
    } as unknown as jest.Mocked<MetricsService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: MetricsService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns metrics from metrics service', () => {
    const result = controller.getMetrics();
    expect(result).toContain('process_uptime_seconds 10.000');
    expect(service.getMetrics).toHaveBeenCalledTimes(1);
  });
});
