import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const mappedException = this.mapKnownError(exception.code);

    if (!mappedException) {
      super.catch(exception, host);
      return;
    }

    const status = mappedException.getStatus();

    this.logger.warn(
      JSON.stringify({
        event: 'prisma_request_error',
        code: exception.code,
        statusCode: status,
      }),
    );

    response.status(status).json({
      statusCode: status,
      message: mappedException.message,
    });
  }

  private mapKnownError(code: string) {
    switch (code) {
      case 'P2002':
        return new ConflictException('The resource already exists');
      case 'P2003':
        return new ConflictException('The related resource is not available');
      case 'P2025':
        return new NotFoundException('The requested resource was not found');
      default:
        return null;
    }
  }
}
