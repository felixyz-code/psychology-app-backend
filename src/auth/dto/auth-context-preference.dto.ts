import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ValidationArguments,
  ValidationOptions,
  registerDecorator,
} from 'class-validator';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function IsUuidOrNull(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isUuidOrNull',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === null) {
            return true;
          }

          if (typeof value !== 'string') {
            return false;
          }

          return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            value,
          );
        },
        defaultMessage(args?: ValidationArguments) {
          return `${args?.property ?? 'value'} must be a UUID or null`;
        },
      },
    });
  };
}

export class UpdateAuthContextPreferenceDto {
  @ApiProperty({
    description:
      'Preferred organization UUID for UX-only bootstrap. Use null to clear the preference.',
    type: String,
    format: 'uuid',
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @Transform(({ obj, value }: { obj?: unknown; value: unknown }) => {
    const extraKeys = Object.keys(isRecord(obj) ? obj : {}).filter(
      (key) => key !== 'organizationId',
    );
    if (extraKeys.length > 0) {
      throw new BadRequestException(
        extraKeys.map((key) => `property ${key} should not exist`),
      );
    }

    return value;
  })
  @IsUuidOrNull({
    message: 'organizationId must be a UUID or null',
  })
  organizationId: string | null;
}

export class AuthContextPreferenceResponseDto {
  @ApiPropertyOptional({
    description:
      'Persisted preferred organization UUID returned only when it remains currently eligible for UX purposes.',
    type: String,
    format: 'uuid',
    nullable: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  preferredOrganizationId: string | null;
}
