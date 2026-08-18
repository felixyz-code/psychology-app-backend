import { ExecutionContext, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { lastValueFrom, of, throwError } from 'rxjs';
import { RequestContextService } from '../request-context/request-context.service';
import { HttpLoggingInterceptor } from './http-logging.interceptor';

describe('HttpLoggingInterceptor', () => {
  let context: RequestContextService;
  let interceptor: HttpLoggingInterceptor;

  beforeEach(() => {
    context = new RequestContextService();
    interceptor = new HttpLoggingInterceptor(context);
  });

  it('logs a structured successful request without its body', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();

    await context.run('request_123', () =>
      lastValueFrom(
        interceptor.intercept(createExecutionContext(), {
          handle: () => of({ password: 'not-for-logs' }),
        }),
      ),
    );

    expect(JSON.parse(log.mock.calls.at(-1)?.[0] as string)).toMatchObject({
      event: 'http_request',
      requestId: 'request_123',
      method: 'POST',
      path: '/patients/opaque-id',
      statusCode: 201,
    });
    expect(log).not.toHaveBeenCalledWith(
      expect.stringContaining('not-for-logs'),
    );
  });

  it('logs a sanitized error without error details', async () => {
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
