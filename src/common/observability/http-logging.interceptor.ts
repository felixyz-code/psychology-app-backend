import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { RequestContextService } from '../request-context/request-context.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    const requestId = this.requestContext.requestId ?? 'unavailable';
    const path = request.path;
    const tenantContext = this.requestContext.tenantContext;
    const baseLog = {
      requestId,
      method: request.method,
      path,
      ...(tenantContext && {
        userId: tenantContext.userId,
        organizationId: tenantContext.organizationId,
        membershipId: tenantContext.membershipId,
        tenantResolutionMode: tenantContext.resolutionMode,
      }),
    };

    return next.handle().pipe(
      tap(() =>
        this.logger.log(
          JSON.stringify({
            event: 'http_request',
            ...baseLog,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          }),
        ),
      ),
      catchError((error: unknown) => {
        const statusCode = getStatusCode(error);
        this.logger.warn(
          JSON.stringify({
            event: 'http_error',
            ...baseLog,
            errorType: getErrorType(error),
            statusCode,
            durationMs: Date.now() - startedAt,
          }),
        );
        return throwError(() => error);
      }),
    );
  }
}

function getStatusCode(error: unknown) {
  if (isHttpExceptionLike(error)) {
    return error.getStatus();
  }

  return 500;
}

function getErrorType(error: unknown) {
  return error instanceof Error ? error.name : 'UnknownError';
}

function isHttpExceptionLike(
  error: unknown,
): error is { getStatus: () => number } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'getStatus' in error &&
    typeof (error as { getStatus?: unknown }).getStatus === 'function'
  );
}
