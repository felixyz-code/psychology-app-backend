import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { ASCII_EMAIL_IDENTITY_PATTERN } from '../../common/identity/email-identity.util';
import { trimStringInput } from '../../common/identity/trim-string.transform';

export const MIN_BOOTSTRAP_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_UTF8_BYTES = 72;

@ValidatorConstraint({ name: 'maxUtf8Bytes', async: false })
class MaxUtf8BytesConstraint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    return (
      typeof value === 'string' &&
      Buffer.byteLength(value, 'utf8') <= MAX_PASSWORD_UTF8_BYTES
    );
  }

  defaultMessage() {
    return `password must be at most ${MAX_PASSWORD_UTF8_BYTES} UTF-8 bytes`;
  }
}

export class CreateFreelancerBootstrapDto {
  @ApiProperty({
    example: 'freelancer@example.test',
    maxLength: 255,
  })
  @Transform(({ value }) => trimStringInput(value))
  @Matches(ASCII_EMAIL_IDENTITY_PATTERN, {
    message: 'email must contain only ASCII characters',
  })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    example: 'FreelancerBootstrapSecret1!',
    minLength: MIN_BOOTSTRAP_PASSWORD_LENGTH,
    maxLength: MAX_PASSWORD_UTF8_BYTES,
  })
  @IsString()
  @MinLength(MIN_BOOTSTRAP_PASSWORD_LENGTH)
  @Validate(MaxUtf8BytesConstraint)
  password: string;

  @ApiProperty({
    example: 'Dra. Ana Martinez',
    maxLength: 150,
  })
  @Transform(({ value }) => trimStringInput(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name: string;

  @ApiProperty({
    example: 'Consultorio Ana Martinez',
    maxLength: 255,
  })
  @Transform(({ value }) => trimStringInput(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  organizationName: string;
}
