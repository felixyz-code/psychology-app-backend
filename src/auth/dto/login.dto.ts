import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { trimStringInput } from '../../common/identity/trim-string.transform';

export class LoginDto {
  @ApiProperty({
    description: 'User email',
    example: 'psychologist@psychology-app.local',
  })
  @Transform(({ value }) => trimStringInput(value))
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({
    description: 'User password',
    example: 'ChangeMe123!',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(255)
  password: string;
}
