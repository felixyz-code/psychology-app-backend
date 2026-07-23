import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const MAX_SERIALIZATION_ATTEMPTS = 3;

export async function serializableTransaction<T>(
  prisma: PrismaService,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(work, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        isSerializableWriteConflict(error) &&
        attempt < MAX_SERIALIZATION_ATTEMPTS
      )
        continue;
      if (isSerializableWriteConflict(error))
        throw new ConflictException('Concurrent operation conflict');
      throw error;
    }
  }
  throw new ConflictException('Concurrent operation conflict');
}

export function isUniqueViolation(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
export function isSerializableWriteConflict(error: unknown) {
  const visited = new Set<object>();
  let current: unknown = error;

  for (let depth = 0; depth < 8; depth += 1) {
    if (!isRecord(current) || visited.has(current)) return false;
    visited.add(current);

    if (
      current instanceof Prisma.PrismaClientKnownRequestError &&
      current.code === 'P2034'
    ) {
      return true;
    }
    if (
      current.code === 'P2034' ||
      current.code === '40001' ||
      current.originalCode === '40001' ||
      current.kind === 'TransactionWriteConflict' ||
      (current.name === 'DriverAdapterError' &&
        current.message === 'TransactionWriteConflict')
    ) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
