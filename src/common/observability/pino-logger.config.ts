import { IncomingMessage, ServerResponse } from 'node:http';
import { Params } from 'nestjs-pino';
import { AppConfigService } from '../../config/configuration';

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
          req.url?.startsWith('/health') ?? false,
      },
      customProps: (req: IncomingMessage) => {
        const headerId = req.headers['x-request-id'];
        const requestId = Array.isArray(headerId) ? headerId[0] : headerId;
        return {
          requestId: requestId || (req as unknown as { id?: string }).id,
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
