import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'User email',
    example: 'psychologist@psychology-app.local',
  })
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
