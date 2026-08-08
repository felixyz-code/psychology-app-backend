import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { RequestContextService } from './request-context/request-context.service';

type ErrorDetails = Record<string, unknown> | null;

const CONTRACT_ERROR_CODES = new Set([
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'TENANT_CONTEXT_REQUIRED',
  'RESOURCE_NOT_FOUND',
  'CONFLICT',
  'CONCURRENT_UPDATE',
  'LAST_OWNER_PROTECTED',
  'CAPABILITY_DENIED',
  'INVITATION_TERMINAL',
  'INVITATION_RECIPIENT_MISMATCH',
  'RATE_LIMITED',
  'UNEXPECTED_ERROR',
]);

@Catch()
@Injectable()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorEnvelopeFilter.name);

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const mappedPrisma = this.mapPrismaError(exception);
    const statusCode =
      mappedPrisma?.statusCode ??
      (exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR);
    const code =
      mappedPrisma?.code ?? this.codeForHttpException(exception, statusCode);
    const details =
      mappedPrisma?.details ?? this.detailsForHttpException(exception, code);
    const message =
      mappedPrisma?.message ?? this.messageForException(exception, statusCode);
    const requestId = this.requestContext.requestId ?? 'unavailable';

    if (statusCode >= 500) {
      this.logger.error(
        JSON.stringify({
          event: 'unhandled_http_error',
          requestId,
          statusCode,
          code,
        }),
      );
    }

    response.status(statusCode).json({
      statusCode,
      code,
      message,
      requestId,
      details,
    });
  }

  private mapPrismaError(exception: unknown) {
    if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
      return null;
    }

    switch (exception.code) {
      case 'P2002':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'The resource already exists',
          details: null,
        };
      case 'P2003':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONFLICT',
          message: 'The related resource is not available',
          details: null,
        };
      case 'P2025':
        return {
          statusCode: HttpStatus.NOT_FOUND,
          code: 'RESOURCE_NOT_FOUND',
          message: 'The requested resource was not found',
          details: null,
        };
      case 'P2034':
        return {
          statusCode: HttpStatus.CONFLICT,
          code: 'CONCURRENT_UPDATE',
          message: 'The resource changed. Refresh and try again.',
          details: { retryContext: true },
        };
      default:
        return null;
    }
  }

  private codeForHttpException(exception: unknown, statusCode: number) {
    const explicitCode = this.explicitContractCode(exception);
    if (explicitCode) {
      return explicitCode;
    }

    if (statusCode === 400) {
      return 'VALIDATION_ERROR';
    }

    if (statusCode === 401) {
      return 'UNAUTHENTICATED';
    }

    if (statusCode === 403) {
      const message = this.exceptionMessage(exception).toLowerCase();
      return message.includes('capability') ? 'CAPABILITY_DENIED' : 'FORBIDDEN';
    }

    if (statusCode === 409) {
      const message = this.exceptionMessage(exception).toLowerCase();
      if (message.includes('concurrent') || message.includes('concurrently')) {
        return 'CONCURRENT_UPDATE';
      }
      if (message.includes('selection') || message.includes('tenant context')) {
        return 'TENANT_CONTEXT_REQUIRED';
      }
      return 'CONFLICT';
    }

    if (statusCode === 404) {
      return 'RESOURCE_NOT_FOUND';
    }

    if (statusCode === 429) {
      return 'RATE_LIMITED';
    }

    return 'UNEXPECTED_ERROR';
  }

  private detailsForHttpException(
    exception: unknown,
    code: string,
  ): ErrorDetails {
    if (!(exception instanceof HttpException)) {
      return null;
    }

    const response = exception.getResponse();
    if (!response || typeof response !== 'object') {
      return null;
    }

    if (code === 'TENANT_CONTEXT_REQUIRED') {
      return {
        reason: this.exceptionMessage(exception)
          .toLowerCase()
          .includes('ambiguous')
          ? 'AMBIGUOUS'
          : 'MISSING',
      };
    }

    if (code === 'RATE_LIMITED') {
      const retryAfterSeconds =
        'retryAfterSeconds' in response &&
        typeof response.retryAfterSeconds === 'number' &&
        Number.isInteger(response.retryAfterSeconds) &&
        response.retryAfterSeconds >= 0
          ? response.retryAfterSeconds
          : null;
      return { retryAfterSeconds };
    }

    if (code === 'CONCURRENT_UPDATE') {
      return { retryContext: true };
    }

    if (code === 'UNEXPECTED_ERROR') {
      return { category: 'SERVER' };
    }

    return null;
  }

  private explicitContractCode(exception: unknown): string | null {
    if (!(exception instanceof HttpException)) {
      return null;
    }

    const response = exception.getResponse();
    if (
      !response ||
      typeof response !== 'object' ||
      !('code' in response) ||
      typeof response.code !== 'string' ||
      !CONTRACT_ERROR_CODES.has(response.code)
    ) {
      return null;
    }

    return response.code;
  }

  private messageForException(exception: unknown, statusCode: number) {
    if (exception instanceof HttpException) {
      const message = this.exceptionMessage(exception);
      return message || HttpStatus[statusCode] || 'Request failed';
    }

    return 'Unexpected server error';
  }

  private exceptionMessage(exception: unknown) {
    if (!(exception instanceof HttpException)) {
      return '';
    }

    const response = exception.getResponse();
    if (typeof response === 'string') {
      return response;
    }

    if (
      response &&
      typeof response === 'object' &&
      'message' in response &&
      typeof response.message === 'string'
    ) {
      return response.message;
    }

    return '';
  }
}
