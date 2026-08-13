import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDefined, IsISO8601, IsIn, IsOptional } from 'class-validator';

function HasExactlyOnePrecondition(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'hasExactlyOneLogoPrecondition',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(_: unknown, args: ValidationArguments) {
          const value = args.object as LogoMutationPreconditionDto;
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

export class LogoMutationPreconditionDto {
  @ApiPropertyOptional({ enum: ['ABSENT'] })
  @IsOptional()
  @IsIn(['ABSENT'])
  expectedRowState?: 'ABSENT';

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsISO8601({ strict: true })
  expectedUpdatedAt?: string;

  @HasExactlyOnePrecondition()
  private readonly concurrencyPrecondition?: never;
}

export class RemoveOrganizationLogoDto {
  @ApiProperty({
    format: 'date-time',
    description: 'Canonical logo updatedAt observed before removal.',
  })
  @IsDefined()
  @IsISO8601({ strict: true })
  expectedUpdatedAt: string;
}
