import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeMembershipStatusDto } from './change-membership-status.dto';

describe('ChangeMembershipStatusDto', () => {
  const expectedUpdatedAt = '2026-08-08T12:00:00.000Z';

  it.each(['ACTIVE', 'SUSPENDED'])('accepts %s', async (status) => {
    const dto = plainToInstance(ChangeMembershipStatusDto, {
      status,
      expectedUpdatedAt,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['INVITED', 'REVOKED', 'UNKNOWN'])('rejects %s', async (status) => {
    const dto = plainToInstance(ChangeMembershipStatusDto, {
      status,
      expectedUpdatedAt,
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'status' })]),
    );
  });

  it('rejects an empty payload', async () => {
    const dto = plainToInstance(ChangeMembershipStatusDto, {});

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'status' })]),
    );
  });

  it('rejects an invalid optimistic concurrency precondition', async () => {
    const dto = plainToInstance(ChangeMembershipStatusDto, {
      status: 'ACTIVE',
      expectedUpdatedAt: 'not-a-timestamp',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'expectedUpdatedAt' }),
      ]),
    );
  });
});
