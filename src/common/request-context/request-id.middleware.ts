import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { RequestContextService } from './request-context.service';

const requestIdPattern = /^[A-Za-z0-9_-]{8,128}$/;
const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const incomingRequestId = request.header('x-request-id');
    const requestId =
      incomingRequestId && requestIdPattern.test(incomingRequestId)
        ? incomingRequestId
        : randomUUID();

    const incomingTraceparent = request.header('traceparent');
    let traceId: string;
    let spanId: string;
    let traceFlags = '01';

    if (incomingTraceparent && traceparentPattern.test(incomingTraceparent)) {
      const match = incomingTraceparent.match(traceparentPattern)!;
      traceId = match[1].toLowerCase();
      spanId = randomBytes(8).toString('hex');
      traceFlags = match[3];
    } else {
      traceId = randomBytes(16).toString('hex');
      spanId = randomBytes(8).toString('hex');
    }

    const traceparent = `00-${traceId}-${spanId}-${traceFlags}`;

    response.setHeader('x-request-id', requestId);
    response.setHeader('traceparent', traceparent);
    response.setHeader('x-trace-id', traceId);

    this.requestContext.run(
      {
        requestId,
        traceId,
        spanId,
        traceparent,
      },
      next,
    );
  }
}
