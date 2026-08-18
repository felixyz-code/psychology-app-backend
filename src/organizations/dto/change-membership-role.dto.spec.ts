import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangeMembershipRoleDto } from './change-membership-role.dto';

describe('ChangeMembershipRoleDto', () => {
  const expectedUpdatedAt = '2026-08-08T12:00:00.000Z';

  it('accepts a non-owner role with a canonical precondition', async () => {
    const dto = plainToInstance(ChangeMembershipRoleDto, {
      role: 'PSYCHOLOGIST',
      expectedUpdatedAt,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects OWNER and missing preconditions', async () => {
    const dto = plainToInstance(ChangeMembershipRoleDto, { role: 'OWNER' });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'role' }),
        expect.objectContaining({ property: 'expectedUpdatedAt' }),
      ]),
    );
  });
});
