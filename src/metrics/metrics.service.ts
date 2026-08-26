import { Injectable } from '@nestjs/common';

type HttpMetricKey = string;

interface HttpMetricEntry {
  method: string;
  route: string;
  statusCode: number;
  count: number;
  durationSumSeconds: number;
}

@Injectable()
export class MetricsService {
  private readonly httpMetrics = new Map<HttpMetricKey, HttpMetricEntry>();

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    durationMs: number,
  ) {
    const normalizedRoute = this.normalizeRoute(route);
    const key = `${method}:${normalizedRoute}:${statusCode}`;
    const existing = this.httpMetrics.get(key);
    const durationSeconds = durationMs / 1000;

    if (existing) {
      existing.count += 1;
      existing.durationSumSeconds += durationSeconds;
    } else {
      this.httpMetrics.set(key, {
        method,
        route: normalizedRoute,
        statusCode,
        count: 1,
        durationSumSeconds: durationSeconds,
      });
    }
  }

  getMetrics(): string {
    const lines: string[] = [];
    const mem = process.memoryUsage();
    const cpu = process.cpuUsage();
    const uptime = process.uptime();

    // Process & Runtime Metrics
    lines.push('# HELP process_uptime_seconds The process uptime in seconds.');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${uptime.toFixed(3)}`);
    lines.push('');

    lines.push(
      '# HELP process_cpu_user_seconds_total Total user CPU time spent in seconds.',
    );
    lines.push('# TYPE process_cpu_user_seconds_total counter');
    lines.push(`process_cpu_user_seconds_total ${(cpu.user / 1e6).toFixed(6)}`);
    lines.push('');

    lines.push(
      '# HELP process_cpu_system_seconds_total Total system CPU time spent in seconds.',
    );
    lines.push('# TYPE process_cpu_system_seconds_total counter');
    lines.push(
      `process_cpu_system_seconds_total ${(cpu.system / 1e6).toFixed(6)}`,
    );
    lines.push('');

    lines.push(
      '# HELP nodejs_heap_size_total_bytes Process heap memory total in bytes.',
    );
    lines.push('# TYPE nodejs_heap_size_total_bytes gauge');
    lines.push(`nodejs_heap_size_total_bytes ${mem.heapTotal}`);
    lines.push('');

    lines.push(
      '# HELP nodejs_heap_size_used_bytes Process heap memory used in bytes.',
    );
    lines.push('# TYPE nodejs_heap_size_used_bytes gauge');
    lines.push(`nodejs_heap_size_used_bytes ${mem.heapUsed}`);
    lines.push('');

    lines.push('# HELP nodejs_rss_bytes Process resident set size in bytes.');
    lines.push('# TYPE nodejs_rss_bytes gauge');
    lines.push(`nodejs_rss_bytes ${mem.rss}`);
    lines.push('');

    lines.push(
      '# HELP nodejs_external_memory_bytes Process external memory in bytes.',
    );
    lines.push('# TYPE nodejs_external_memory_bytes gauge');
    lines.push(`nodejs_external_memory_bytes ${mem.external}`);
    lines.push('');

    // HTTP Request Metrics
    lines.push('# HELP http_requests_total Total number of HTTP requests.');
    lines.push('# TYPE http_requests_total counter');
    for (const entry of this.httpMetrics.values()) {
      lines.push(
        `http_requests_total{method="${entry.method}",route="${entry.route}",status_code="${entry.statusCode}"} ${entry.count}`,
      );
    }
    lines.push('');

    lines.push(
      '# HELP http_request_duration_seconds Total HTTP request processing duration in seconds.',
    );
    lines.push('# TYPE http_request_duration_seconds summary');
    for (const entry of this.httpMetrics.values()) {
      lines.push(
        `http_request_duration_seconds_sum{method="${entry.method}",route="${entry.route}",status_code="${entry.statusCode}"} ${entry.durationSumSeconds.toFixed(6)}`,
      );
      lines.push(
        `http_request_duration_seconds_count{method="${entry.method}",route="${entry.route}",status_code="${entry.statusCode}"} ${entry.count}`,
      );
    }
    lines.push('');

    return lines.join('\n');
  }

  private normalizeRoute(route: string): string {
    if (!route || route === '') return '/';
    // Clean query parameters
    const cleanRoute = route.split('?')[0];
    // Replace UUIDs with :id parameter placeholders for bounded cardinality
    return cleanRoute
      .replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        ':id',
      )
      .replace(/\/[0-9]+(?=\/|$)/g, '/:id');
  }
}
