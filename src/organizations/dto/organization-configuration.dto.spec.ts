import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateOrganizationBrandingDto } from './update-organization-branding.dto';
import { UpdateOrganizationSettingsDto } from './update-organization-settings.dto';

describe('organization configuration DTOs', () => {
  it.each([null, 1, 1440])('accepts duration %p', async (duration) => {
    const dto = plainToInstance(UpdateOrganizationSettingsDto, {
      defaultAppointmentDuration: duration,
      expectedRowState: 'ABSENT',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it.each([0, -1, 1441, 12.5])('rejects duration %p', async (duration) => {
    const dto = plainToInstance(UpdateOrganizationSettingsDto, {
      defaultAppointmentDuration: duration,
      expectedRowState: 'ABSENT',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'defaultAppointmentDuration' }),
      ]),
    );
  });

  it('rejects a settings mutation without a managed value', async () => {
    const dto = plainToInstance(UpdateOrganizationSettingsDto, {
      expectedRowState: 'ABSENT',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'defaultAppointmentDuration' }),
      ]),
    );
  });

  it.each(['#123ABC', '#abc123'])(
    'accepts strict hex color %s and normalizes it',
    async (color) => {
      const dto = plainToInstance(UpdateOrganizationBrandingDto, {
        primaryColor: color,
        expectedRowState: 'ABSENT',
      });

      await expect(validate(dto)).resolves.toHaveLength(0);
      expect(dto.primaryColor).toBe(color.toUpperCase());
    },
  );

  it.each(['#ABC', '#ABCDEF00', 'red', 'rgb(1, 2, 3)', 'var(--x)', ' #123456'])(
    'rejects non-strict color %s',
    async (primaryColor) => {
      const dto = plainToInstance(UpdateOrganizationBrandingDto, {
        primaryColor,
        expectedRowState: 'ABSENT',
      });

      await expect(validate(dto)).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: 'primaryColor' }),
        ]),
      );
    },
  );

  it.each([
    {},
    {
      expectedRowState: 'ABSENT',
      expectedUpdatedAt: '2026-08-12T00:00:00.000Z',
    },
  ])('requires exactly one concurrency precondition', async (precondition) => {
    const dto = plainToInstance(UpdateOrganizationSettingsDto, {
      defaultAppointmentDuration: 60,
      ...precondition,
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'concurrencyPrecondition' }),
      ]),
    );
  });

  it('accepts and normalizes valid visualName and accentColor', async () => {
    const dto = plainToInstance(UpdateOrganizationBrandingDto, {
      visualName: '  Centro Psicológico  ',
      primaryColor: '#2563EB',
      accentColor: '#0d9488',
      expectedRowState: 'ABSENT',
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.visualName).toBe('Centro Psicológico');
    expect(dto.accentColor).toBe('#0D9488');
  });

  it('rejects invalid accentColor format', async () => {
    const dto = plainToInstance(UpdateOrganizationBrandingDto, {
      primaryColor: '#2563EB',
      accentColor: 'invalid-color',
      expectedRowState: 'ABSENT',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'accentColor' }),
      ]),
    );
  });
});
