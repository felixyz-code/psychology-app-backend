import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../config/configuration';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: AppConfigService,
          useValue: {
            databaseUrl:
              'postgresql://test_user:test_password@localhost:5432/test_db?schema=public',
          },
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
