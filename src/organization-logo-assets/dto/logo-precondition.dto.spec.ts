import { validate } from 'class-validator';
import {
  LogoMutationPreconditionDto,
  RemoveOrganizationLogoDto,
} from './logo-precondition.dto';

describe('organization logo mutation preconditions', () => {
  it.each([
    [{ expectedRowState: 'ABSENT' }, true],
    [{ expectedUpdatedAt: '2026-08-13T00:00:00.000Z' }, true],
    [{}, false],
    [
      {
        expectedRowState: 'ABSENT',
        expectedUpdatedAt: '2026-08-13T00:00:00.000Z',
      },
      false,
    ],
    [{ expectedRowState: 'PRESENT' }, false],
    [{ expectedUpdatedAt: 'not-a-timestamp' }, false],
  ])('requires exactly one valid precondition', async (input, valid) => {
    const dto = Object.assign(new LogoMutationPreconditionDto(), input);
    const errors = await validate(dto);
    if (valid) {
      expect(errors).toHaveLength(0);
    } else {
      expect(errors).not.toHaveLength(0);
    }
  });

  it('requires a canonical timestamp to remove an existing logo', async () => {
    const missing = new RemoveOrganizationLogoDto();
    const valid = Object.assign(new RemoveOrganizationLogoDto(), {
      expectedUpdatedAt: '2026-08-13T00:00:00.000Z',
    });

    expect(await validate(missing)).not.toHaveLength(0);
    expect(await validate(valid)).toHaveLength(0);
  });
});
