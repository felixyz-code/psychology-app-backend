import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    service = new MetricsService();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('produces valid Prometheus exposition format containing runtime metrics', () => {
    const metrics = service.getMetrics();
    expect(metrics).toContain('# HELP process_uptime_seconds');
    expect(metrics).toContain('# TYPE process_uptime_seconds gauge');
    expect(metrics).toContain('process_uptime_seconds');

    expect(metrics).toContain('# HELP process_cpu_user_seconds_total');
    expect(metrics).toContain('# TYPE process_cpu_user_seconds_total counter');
    expect(metrics).toContain('process_cpu_user_seconds_total');

    expect(metrics).toContain('# HELP nodejs_heap_size_used_bytes');
    expect(metrics).toContain('# TYPE nodejs_heap_size_used_bytes gauge');
    expect(metrics).toContain('nodejs_heap_size_used_bytes');

    expect(metrics).toContain('# HELP nodejs_rss_bytes');
    expect(metrics).toContain('# TYPE nodejs_rss_bytes gauge');
    expect(metrics).toContain('nodejs_rss_bytes');
  });

  it('records HTTP request counts, durations, and normalizes parameterized routes', () => {
    service.recordHttpRequest(
      'GET',
      '/patients/11111111-2222-3333-4444-555555555555',
      200,
      45.5,
    );
    service.recordHttpRequest(
      'GET',
      '/patients/66666666-7777-8888-9999-000000000000',
      200,
      54.5,
    );
    service.recordHttpRequest('POST', '/auth/login', 401, 12.0);

    const metrics = service.getMetrics();

    expect(metrics).toContain(
      'http_requests_total{method="GET",route="/patients/:id",status_code="200"} 2',
    );
    expect(metrics).toContain(
      'http_requests_total{method="POST",route="/auth/login",status_code="401"} 1',
    );
    expect(metrics).toContain(
      'http_request_duration_seconds_count{method="GET",route="/patients/:id",status_code="200"} 2',
    );
    expect(metrics).toContain(
      'http_request_duration_seconds_sum{method="GET",route="/patients/:id",status_code="200"} 0.100000',
    );
  });
});
