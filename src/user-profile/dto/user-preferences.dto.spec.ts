import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UserDateFormat, UserTimeFormat } from '@prisma/client';
import {
  UpdateUserPreferencesDto,
  IsIanaTimeZone,
} from './user-preferences.dto';

describe('UpdateUserPreferencesDto validation', () => {
  it('validates a correct payload successfully', async () => {
    const payload = {
      emailNotifications: false,
      inAppNotifications: true,
      appointmentReminders: true,
      reminderAdvanceMinutes: 30,
      sessionDigest: false,
      timeZone: 'America/Mexico_City',
      timeFormat: UserTimeFormat.TWENTY_FOUR_HOUR,
      dateFormat: UserDateFormat.YYYY_MM_DD,
      locale: 'es-MX',
      weekStartsOn: 1,
    };

    const instance = plainToInstance(UpdateUserPreferencesDto, payload);
    const errors = await validate(instance);
    expect(errors.length).toBe(0);
  });

  it('rejects an invalid IANA timezone', async () => {
    const payload = {
      timeZone: 'Invalid/Non_Existent_Timezone',
    };

    const instance = plainToInstance(UpdateUserPreferencesDto, payload);
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('timeZone');
  });

  it('rejects an invalid reminder advance minutes', async () => {
    const payload = {
      reminderAdvanceMinutes: 45, // Not in [15, 30, 60, 120, 1440]
    };

    const instance = plainToInstance(UpdateUserPreferencesDto, payload);
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('reminderAdvanceMinutes');
  });

  it('rejects an invalid locale', async () => {
    const payload = {
      locale: 'fr-FR', // Not in ALLOWED_LOCALES
    };

    const instance = plainToInstance(UpdateUserPreferencesDto, payload);
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('locale');
  });

  it('rejects invalid weekStartsOn values', async () => {
    const payload = {
      weekStartsOn: 5,
    };

    const instance = plainToInstance(UpdateUserPreferencesDto, payload);
    const errors = await validate(instance);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].property).toBe('weekStartsOn');
  });
});
