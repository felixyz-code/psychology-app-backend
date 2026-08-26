import { IncomingMessage, ServerResponse } from 'node:http';
import { Params } from 'nestjs-pino';
import { AppConfigService } from '../../config/configuration';

const traceparentPattern = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

export function createPinoHttpConfig(config: AppConfigService): Params {
  const isProd = config.nodeEnv === 'production';

  return {
    pinoHttp: {
      level: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
      transport: isProd
        ? undefined
        : {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
            },
          },
      autoLogging: {
        ignore: (req: IncomingMessage) =>
          (req.url?.startsWith('/health') || req.url?.startsWith('/metrics')) ??
          false,
      },
      customProps: (req: IncomingMessage) => {
        const headerId = req.headers['x-request-id'];
        const requestId = Array.isArray(headerId) ? headerId[0] : headerId;
        const headerTraceId = req.headers['x-trace-id'];
        let traceId = Array.isArray(headerTraceId)
          ? headerTraceId[0]
          : headerTraceId;

        if (!traceId) {
          const headerTraceparent = req.headers['traceparent'];
          const traceparent = Array.isArray(headerTraceparent)
            ? headerTraceparent[0]
            : headerTraceparent;
          if (traceparent && traceparentPattern.test(traceparent)) {
            const match = traceparent.match(traceparentPattern);
            if (match) {
              traceId = match[1].toLowerCase();
            }
          }
        }

        return {
          requestId: requestId || (req as unknown as { id?: string }).id,
          traceId:
            traceId || requestId || (req as unknown as { id?: string }).id,
        };
      },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'password',
          '*.password',
          'token',
          'tokenDigest',
          '*.tokenDigest',
          'content',
          '*.content',
          'diagnosis',
          'treatmentPlan',
          'notes',
        ],
        censor: '[REDACTED]',
      },
      serializers: {
        req: (req: IncomingMessage & { id?: string | number }) => ({
          id: req.id,
          method: req.method,
          url: req.url,
        }),
        res: (res: ServerResponse) => ({
          statusCode: res.statusCode,
        }),
      },
    },
  };
}
