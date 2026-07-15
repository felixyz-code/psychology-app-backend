import { ArgumentsHost } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaExceptionFilter } from './prisma-exception.filter';

describe('PrismaExceptionFilter', () => {
  const createHost = () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });
    const host = {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as unknown as ArgumentsHost;

    return { host, status, json };
  };

  it.each([
    ['P2002', 409, 'The resource already exists'],
    ['P2003', 409, 'The related resource is not available'],
    ['P2025', 404, 'The requested resource was not found'],
  ])(
    'maps %s without exposing Prisma metadata',
    (code, statusCode, message) => {
      const { host, status, json } = createHost();
      const exception = new Prisma.PrismaClientKnownRequestError('internal', {
        code,
        clientVersion: '7.8.0',
        meta: { modelName: 'Patient' },
      });

      new PrismaExceptionFilter().catch(exception, host);

      expect(status).toHaveBeenCalledWith(statusCode);
      expect(json).toHaveBeenCalledWith({ statusCode, message });
    },
  );
});
