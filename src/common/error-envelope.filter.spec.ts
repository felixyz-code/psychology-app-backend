import {
  ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { MulterError } from 'multer';

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

  it('preserves the stable last-owner protection code', () => {
    const filter = new ErrorEnvelopeFilter(new RequestContextService());
    const { host, json } = createHost();

    filter.catch(
      new ConflictException({
        code: 'LAST_OWNER_PROTECTED',
        message: 'Organization must retain an active owner',
      }),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 409,
      code: 'LAST_OWNER_PROTECTED',
      message: 'Organization must retain an active owner',
      requestId: 'unavailable',
      details: null,
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

  it.each([
    ['LIMIT_FILE_SIZE', 413, 'Uploaded file exceeds configured size limit'],
    ['LIMIT_UNEXPECTED_FILE', 400, 'Invalid multipart upload'],
  ])(
    'maps Multer %s to the bounded upload response',
    (reason, expectedStatus, expectedMessage) => {
      const filter = new ErrorEnvelopeFilter(new RequestContextService());
      const { host, json } = createHost();

      filter.catch(new MulterError(reason as 'LIMIT_FILE_SIZE'), host);

      expect(json).toHaveBeenCalledWith({
        statusCode: expectedStatus,
        code: 'VALIDATION_ERROR',
        message: expectedMessage,
        requestId: 'unavailable',
        details: null,
      });
    },
  );

  it('preserves PLAN_LIMIT_EXCEEDED contract code and quota details', () => {
    const filter = new ErrorEnvelopeFilter(new RequestContextService());
    const { host, json } = createHost();

    filter.catch(
      new HttpException(
        {
          code: 'PLAN_LIMIT_EXCEEDED',
          message: 'Patient limit reached for current plan',
          details: {
            quotaKey: 'MAX_PATIENTS',
            limit: 25,
            currentUsage: 25,
          },
        },
        403,
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 403,
      code: 'PLAN_LIMIT_EXCEEDED',
      message: 'Patient limit reached for current plan',
      requestId: 'unavailable',
      details: {
        quotaKey: 'MAX_PATIENTS',
        limit: 25,
        currentUsage: 25,
      },
    });
  });

  it('preserves FEATURE_NOT_AVAILABLE contract code and feature details', () => {
    const filter = new ErrorEnvelopeFilter(new RequestContextService());
    const { host, json } = createHost();

    filter.catch(
      new HttpException(
        {
          code: 'FEATURE_NOT_AVAILABLE',
          message: 'PDF export is not available on your current plan',
          details: {
            featureKey: 'CAN_EXPORT_PDF',
            requiredTier: 'PROFESSIONAL',
          },
        },
        403,
      ),
      host,
    );

    expect(json).toHaveBeenCalledWith({
      statusCode: 403,
      code: 'FEATURE_NOT_AVAILABLE',
      message: 'PDF export is not available on your current plan',
      requestId: 'unavailable',
      details: {
        featureKey: 'CAN_EXPORT_PDF',
        requiredTier: 'PROFESSIONAL',
      },
    });
  });
});
