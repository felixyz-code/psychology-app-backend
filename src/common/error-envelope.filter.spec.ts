import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';

import { ErrorEnvelopeFilter } from './error-envelope.filter';
import { RequestContextService } from './request-context/request-context.service';

describe('ErrorEnvelopeFilter', () => {
  const createHost = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    return { host, status, json };
  };

  it('maps validation errors into the bounded contract envelope', () => {
    const context = new RequestContextService();
    const filter = new ErrorEnvelopeFilter(context);
    const { host, status, json } = createHost();

    filter.catch(new BadRequestException('Invalid payload'), host);

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid payload',
      requestId: 'unavailable',
      details: null,
    });
  });

  it('redacts forbidden details while preserving the request correlation id', () => {
    const context = new RequestContextService();
    const filter = new ErrorEnvelopeFilter(context);
    const { host, json } = createHost();

    context.run('request_123', () => {
      filter.catch(new ForbiddenException('Organization access denied'), host);
    });

    expect(json).toHaveBeenCalledWith({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'Organization access denied',
      requestId: 'request_123',
      details: null,
    });
  });

  it('maps tenant-context selection conflicts to the V1 error code', () => {
    const filter = new ErrorEnvelopeFilter(new RequestContextService());
    const { host, json } = createHost();

    filter.catch(
      new ConflictException('Organization selection is required'),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'TENANT_CONTEXT_REQUIRED',
      message: 'Organization selection is required',
      requestId: 'unavailable',
      details: { reason: 'MISSING' },
    });
  });

  it('maps concurrent conflict messages to CONCURRENT_UPDATE', () => {
    const filter = new ErrorEnvelopeFilter(new RequestContextService());
    const { host, json } = createHost();

    filter.catch(
      new ConflictException('Organization changed concurrently'),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'CONCURRENT_UPDATE',
      message: 'Organization changed concurrently',
      requestId: 'unavailable',
      details: { retryContext: true },
    });
  });

  it('maps throttling exceptions to RATE_LIMITED with bounded retry details', () => {
    const filter = new ErrorEnvelopeFilter(new RequestContextService());
    const { host, json } = createHost();

    filter.catch(
      new HttpException(
        {
          code: 'RATE_LIMITED',
          message: 'Too many requests',
          retryAfterSeconds: 30,
        },
        429,
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      requestId: 'unavailable',
      details: { retryAfterSeconds: 30 },
    });
  });
});
