import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { SkipTenantContext } from '../tenant-context/decorators/skip-tenant-context.decorator';
import { HealthService } from './health.service';

@Controller('health')
@ApiTags('health')
@SkipTenantContext()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Get process liveness' })
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Get service readiness' })
  ready() {
    return this.healthService.ready();
  }
}

