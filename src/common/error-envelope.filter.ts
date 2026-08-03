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
    if (statusCode === HttpStatus.BAD_REQUEST) {
      return 'VALIDATION_ERROR';
    }

    if (statusCode === HttpStatus.UNAUTHORIZED) {
      return 'UNAUTHENTICATED';
    }

    if (statusCode === HttpStatus.FORBIDDEN) {
      const message = this.exceptionMessage(exception).toLowerCase();
      return message.includes('capability') ? 'CAPABILITY_DENIED' : 'FORBIDDEN';
    }

    if (statusCode === HttpStatus.CONFLICT) {
      const message = this.exceptionMessage(exception).toLowerCase();
      if (message.includes('selection') || message.includes('tenant context')) {
        return 'TENANT_CONTEXT_REQUIRED';
      }
      return 'CONFLICT';
    }

    if (statusCode === HttpStatus.NOT_FOUND) {
      return 'RESOURCE_NOT_FOUND';
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

    const details =
      'details' in response && typeof response.details === 'object'
        ? response.details
        : null;
    return details as ErrorDetails;
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
