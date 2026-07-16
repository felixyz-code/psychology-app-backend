import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { HealthService } from './health.service';

@Controller('health')
@ApiTags('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  @Public()
  @ApiOperation({ summary: 'Get process liveness' })
  live() {
    return this.healthService.live();
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: 'Get service readiness' })
  ready() {
    return this.healthService.ready();
  }
}
