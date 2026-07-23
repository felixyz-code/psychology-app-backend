import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  isSerializableWriteConflict,
  serializableTransaction,
} from './organization-transaction.util';

function driverWriteConflict() {
  return Object.assign(new Error('TransactionWriteConflict'), {
    name: 'DriverAdapterError',
    cause: {
      kind: 'TransactionWriteConflict',
      originalCode: '40001',
      originalMessage:
        'could not serialize access due to read/write dependencies among transactions',
    },
  });
}

describe('serializableTransaction', () => {
  it('recognizes Prisma P2034 serialization failures', () => {
    const error = new Prisma.PrismaClientKnownRequestError('serialization', {
      code: 'P2034',
      clientVersion: 'test',
    });

    expect(isSerializableWriteConflict(error)).toBe(true);
  });

  it('recognizes the adapter TransactionWriteConflict causal shape', () => {
    expect(isSerializableWriteConflict(driverWriteConflict())).toBe(true);
  });

  it('recognizes SQLSTATE 40001 directly and in a nested cause', () => {
    expect(
      isSerializableWriteConflict(
        Object.assign(new Error('serialization'), {
          code: '40001',
        }),
      ),
    ).toBe(true);
    expect(
      isSerializableWriteConflict({
        cause: { cause: { originalCode: '40001' } },
      }),
    ).toBe(true);
  });

  it('terminates safely for circular causes and respects the causal depth limit', () => {
    const circular: { cause?: unknown } = {};
    circular.cause = circular;
    expect(isSerializableWriteConflict(circular)).toBe(false);

    let nested: Record<string, unknown> = { originalCode: '40001' };
    for (let depth = 0; depth < 8; depth += 1) {
      nested = { cause: nested };
    }
    expect(isSerializableWriteConflict(nested)).toBe(false);
  });

  it('does not classify unrelated driver errors as serialization conflicts', () => {
    const error = Object.assign(new Error('Connection refused'), {
      name: 'DriverAdapterError',
      cause: { originalCode: '08006', kind: 'ConnectionError' },
    });

    expect(isSerializableWriteConflict(error)).toBe(false);
  });

  it('retries a driver write conflict and returns the eventual result', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(driverWriteConflict())
      .mockResolvedValueOnce('committed');
    const prisma = {
      $transaction: transaction,
    } as never;

    await expect(
      serializableTransaction(prisma, () => Promise.resolve('unused')),
    ).resolves.toBe('committed');
    expect(transaction).toHaveBeenCalledTimes(2);
  });

  it('maps exhausted driver write conflicts to a stable domain conflict', async () => {
    const transaction = jest.fn().mockRejectedValue(driverWriteConflict());
    const prisma = {
      $transaction: transaction,
    } as never;

    await expect(
      serializableTransaction(prisma, () => Promise.resolve('unused')),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transaction).toHaveBeenCalledTimes(3);
  });

  it('does not retry or convert a non-serializable error', async () => {
    const error = new Error('connection failed');
    const transaction = jest.fn().mockRejectedValue(error);
    const prisma = { $transaction: transaction } as never;

    await expect(
      serializableTransaction(prisma, () => Promise.resolve('unused')),
    ).rejects.toBe(error);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});
