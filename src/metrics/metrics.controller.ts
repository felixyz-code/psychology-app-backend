import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { SkipTenantContext } from '../tenant-context/decorators/skip-tenant-context.decorator';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@SkipTenantContext()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Export Prometheus metrics for platform telemetry and scraping',
  })
  @ApiOkResponse({
    description: 'Prometheus plain text exposition format',
    schema: {
      type: 'string',
      example:
        '# HELP process_uptime_seconds The process uptime in seconds.\n# TYPE process_uptime_seconds gauge\nprocess_uptime_seconds 123.456',
    },
  })
  getMetrics(): string {
    return this.metricsService.getMetrics();
  }
}
