import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class AuthenticatedUserResponseDto {
  @ApiProperty({
    description: 'Authenticated user ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({ example: 'Dr. Ana Martínez' })
  name: string;

  @ApiProperty({ example: 'psychologist@psychology-app.local' })
  email: string;

  @ApiProperty({ enum: UserRole, example: UserRole.PSYCHOLOGIST })
  role: UserRole;
}

export class LoginResponseDto {
  @ApiProperty({
    description: 'JWT access token to send in the Authorization Bearer header',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken: string;

  @ApiProperty({ type: AuthenticatedUserResponseDto })
  user: AuthenticatedUserResponseDto;
}
