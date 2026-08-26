import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { RequestContextService } from '../request-context/request-context.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(HttpLoggingInterceptor.name);

  constructor(
    private readonly requestContext: RequestContextService,
    @Optional() private readonly metricsService?: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    const requestId = this.requestContext.requestId ?? 'unavailable';
    const traceId = this.requestContext.traceId ?? requestId;
    const path = request.path;
    const tenantContext = this.requestContext.tenantContext;
    const baseLog = {
      requestId,
      traceId,
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
      tap(() => {
        const durationMs = Date.now() - startedAt;
        this.metricsService?.recordHttpRequest(
          request.method,
          path,
          response.statusCode,
          durationMs,
        );
        this.logger.log(
          JSON.stringify({
            event: 'http_request',
            ...baseLog,
            statusCode: response.statusCode,
            durationMs,
          }),
        );
      }),
      catchError((error: unknown) => {
        const statusCode = getStatusCode(error);
        const durationMs = Date.now() - startedAt;
        this.metricsService?.recordHttpRequest(
          request.method,
          path,
          statusCode,
          durationMs,
        );
        this.logger.warn(
          JSON.stringify({
            event: 'http_error',
            ...baseLog,
            errorType: getErrorType(error),
            statusCode,
            durationMs,
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
