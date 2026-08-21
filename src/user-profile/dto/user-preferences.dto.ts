import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserDateFormat, UserTimeFormat } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

export function IsIanaTimeZone(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIanaTimeZone',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string' || value.trim().length === 0) {
            return false;
          }
          try {
            Intl.DateTimeFormat(undefined, { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid IANA time zone identifier`;
        },
      },
    });
  };
}

export const ALLOWED_LOCALES = [
  'es-MX',
  'es-ES',
  'es-CO',
  'es-AR',
  'es-CL',
  'en-US',
  'pt-BR',
] as const;

export const ALLOWED_REMINDER_MINUTES = [15, 30, 60, 120, 1440] as const;

export class UserPreferencesResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId: string;

  @ApiProperty({ example: true })
  emailNotifications: boolean;

  @ApiProperty({ example: true })
  inAppNotifications: boolean;

  @ApiProperty({ example: true })
  appointmentReminders: boolean;

  @ApiProperty({ example: 60 })
  reminderAdvanceMinutes: number;

  @ApiProperty({ example: true })
  sessionDigest: boolean;

  @ApiProperty({ example: 'America/Mexico_City' })
  timeZone: string;

  @ApiProperty({
    enum: UserTimeFormat,
    example: UserTimeFormat.TWELVE_HOUR,
  })
  timeFormat: UserTimeFormat;

  @ApiProperty({
    enum: UserDateFormat,
    example: UserDateFormat.DD_MM_YYYY,
  })
  dateFormat: UserDateFormat;

  @ApiProperty({ example: 'es-MX' })
  locale: string;

  @ApiProperty({ example: 1, description: '1 for Monday, 0 for Sunday' })
  weekStartsOn: number;

  @ApiProperty({ example: '2026-08-19T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-08-19T00:00:00.000Z' })
  updatedAt: Date;
}

export class UpdateUserPreferencesDto {
  @ApiPropertyOptional({
    description: 'Whether general email notifications are enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({
    description: 'Whether in-app system notifications are enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  inAppNotifications?: boolean;

  @ApiPropertyOptional({
    description: 'Whether appointment reminder notifications are enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  appointmentReminders?: boolean;

  @ApiPropertyOptional({
    description:
      'Advance minutes for appointment reminders (15, 30, 60, 120, 1440)',
    example: 60,
  })
  @IsOptional()
  @IsInt()
  @IsIn(ALLOWED_REMINDER_MINUTES, {
    message:
      'reminderAdvanceMinutes must be one of: 15, 30, 60, 120, 1440 minutes',
  })
  reminderAdvanceMinutes?: number;

  @ApiPropertyOptional({
    description: 'Whether periodic session digest summary is enabled',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  sessionDigest?: boolean;

  @ApiPropertyOptional({
    description: 'Canonical IANA time zone string (e.g. America/Mexico_City)',
    example: 'America/Mexico_City',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  @IsIanaTimeZone()
  timeZone?: string;

  @ApiPropertyOptional({
    description:
      'Time display format (TWELVE_HOUR: 12h, TWENTY_FOUR_HOUR: 24h)',
    enum: UserTimeFormat,
    example: UserTimeFormat.TWELVE_HOUR,
  })
  @IsOptional()
  @IsEnum(UserTimeFormat)
  timeFormat?: UserTimeFormat;

  @ApiPropertyOptional({
    description:
      'Date display format (DD_MM_YYYY: DD/MM/YYYY, YYYY_MM_DD: YYYY-MM-DD, MM_DD_YYYY: MM/DD/YYYY)',
    enum: UserDateFormat,
    example: UserDateFormat.DD_MM_YYYY,
  })
  @IsOptional()
  @IsEnum(UserDateFormat)
  dateFormat?: UserDateFormat;

  @ApiPropertyOptional({
    description: 'User language / locale tag (e.g. es-MX, es-ES, en-US)',
    example: 'es-MX',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsIn(ALLOWED_LOCALES, {
    message: `locale must be one of: ${ALLOWED_LOCALES.join(', ')}`,
  })
  locale?: string;

  @ApiPropertyOptional({
    description: 'First day of the week (1 for Monday, 0 for Sunday)',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @IsIn([0, 1], { message: 'weekStartsOn must be 0 (Sunday) or 1 (Monday)' })
  weekStartsOn?: number;
}
