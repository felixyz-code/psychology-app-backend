import { ExecutionContext, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RequestContextService } from '../request-context/request-context.service';
import { HttpLoggingInterceptor } from './http-logging.interceptor';
import { MetricsService } from '../../metrics/metrics.service';

describe('HttpLoggingInterceptor', () => {
  let context: RequestContextService;
  let metricsService: jest.Mocked<MetricsService>;
  let interceptor: HttpLoggingInterceptor;

  beforeEach(() => {
    context = new RequestContextService();
    metricsService = {
      recordHttpRequest: jest.fn(),
      getMetrics: jest.fn(),
    } as unknown as jest.Mocked<MetricsService>;
    interceptor = new HttpLoggingInterceptor(context, metricsService);
  });

  it('logs a structured successful request without its body and records metric', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await context.run(
      {
        requestId: 'request_123',
        traceId: 'trace_32chars_hex_00000000000000',
      },
      () =>
        lastValueFrom(
          interceptor.intercept(createExecutionContext(), {
            handle: () => of({ password: 'not-for-logs' }),
          }),
        ),
    );

    expect(JSON.parse(log.mock.calls.at(-1)?.[0] as string)).toMatchObject({
      event: 'http_request',
      requestId: 'request_123',
      traceId: 'trace_32chars_hex_00000000000000',
      method: 'POST',
      path: '/patients/opaque-id',
      statusCode: 201,
    });
    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining('not-for-logs'),
    );
    expect(metricsService.recordHttpRequest).toHaveBeenCalledWith(
      'POST',
      '/patients/opaque-id',
      201,
      expect.any(Number),
    );
  });

  it('logs a sanitized error without error details and records metric', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    await context.run('request_123', async () =>
      expect(
        lastValueFrom(
          interceptor.intercept(createExecutionContext(), {
            handle: () => throwError(() => new Error('JWT secret leaked')),
          }),
        ),
      ).rejects.toThrow('JWT secret leaked'),
    );

    expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({
      event: 'http_error',
      requestId: 'request_123',
      errorType: 'Error',
      statusCode: 500,
    });
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('JWT secret'),
    );
    expect(metricsService.recordHttpRequest).toHaveBeenCalledWith(
      'POST',
      '/patients/opaque-id',
      500,
      expect.any(Number),
    );
  });

  it('logs only approved tenant identifiers and never request bodies', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    log.mockClear();
    await context.run('request_123', () => {
      context.setTenantContext({
        userId: 'user-id',
        organizationId: 'organization-id',
        membershipId: 'membership-id',
        organizationRole: 'OWNER',
        legacyUserRole: 'ADMIN',
        resolutionMode: 'EXPLICIT' as never,
      });
      return lastValueFrom(
        interceptor.intercept(createExecutionContext(), {
          handle: () => of({}),
        }),
      );
    });

    expect(JSON.parse(log.mock.calls.at(-1)?.[0] as string)).toMatchObject({
      userId: 'user-id',
      organizationId: 'organization-id',
      membershipId: 'membership-id',
      tenantResolutionMode: 'EXPLICIT',
    });
  });
});

function createExecutionContext() {
  const request = {
    method: 'POST',
    path: '/patients/opaque-id',
  } as Pick<Request, 'method' | 'path'>;
  const response = { statusCode: 201 } as Pick<Response, 'statusCode'>;

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}
