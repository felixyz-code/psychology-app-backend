import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, MaxLength } from 'class-validator';
import { trimStringInput } from '../../common/identity/trim-string.transform';

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'User email for password recovery',
    example: 'psychologist@psychology-app.local',
    maxLength: 255,
  })
  @Transform(({ value }) => trimStringInput(value))
  @IsEmail()
  @MaxLength(255)
  email: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({
    description: 'Operation outcome flag',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Safe response message for password recovery',
    example:
      'Si el correo electrónico existe en la plataforma, se enviarán las instrucciones para restablecer el acceso.',
  })
  message: string;
}
