import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeMembershipStatusDto } from './change-membership-status.dto';

describe('ChangeMembershipStatusDto', () => {
  it.each(['ACTIVE', 'SUSPENDED'])('accepts %s', async (status) => {
    const dto = plainToInstance(ChangeMembershipStatusDto, { status });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each(['INVITED', 'REVOKED', 'UNKNOWN'])('rejects %s', async (status) => {
    const dto = plainToInstance(ChangeMembershipStatusDto, { status });

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
});
