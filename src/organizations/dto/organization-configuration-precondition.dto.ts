import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsIn, IsOptional } from 'class-validator';

export type ExpectedRowState = 'ABSENT';

function HasExactlyOneConfigurationPrecondition(
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'hasExactlyOneConfigurationPrecondition',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          const value = args.object as OrganizationConfigurationPreconditionDto;
          return (
            (value.expectedRowState !== undefined ? 1 : 0) +
              (value.expectedUpdatedAt !== undefined ? 1 : 0) ===
            1
          );
        },
        defaultMessage() {
          return 'Exactly one of expectedRowState or expectedUpdatedAt is required';
        },
      },
    });
  };
}

export class OrganizationConfigurationPreconditionDto {
  @ApiPropertyOptional({
    enum: ['ABSENT'],
    description:
      'Required only when the observed configuration row was absent.',
  })
  @IsOptional()
  @IsIn(['ABSENT'])
  expectedRowState?: ExpectedRowState;

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Required only when the observed configuration row was present; must equal its canonical updatedAt value.',
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string;

  @HasExactlyOneConfigurationPrecondition()
  private readonly concurrencyPrecondition?: never;
}
