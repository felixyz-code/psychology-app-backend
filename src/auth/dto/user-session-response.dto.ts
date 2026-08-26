import { ApiProperty } from '@nestjs/swagger';

export class UserSessionResponseDto {
  @ApiProperty({
    description: 'Unique session identifier',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Client IP address recorded during session activity',
    example: '192.168.1.1',
    nullable: true,
  })
  ipAddress: string | null;

  @ApiProperty({
    description: 'Raw User-Agent string',
    example: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...',
    nullable: true,
  })
  userAgent: string | null;

  @ApiProperty({
    description: 'Human-readable parsed device and browser summary',
    example: 'Chrome 128 / Windows 10',
    nullable: true,
  })
  deviceInfo: string | null;

  @ApiProperty({
    description: 'Timestamp of last activity / refresh',
    example: '2026-08-25T18:30:00.000Z',
  })
  lastActiveAt: Date;

  @ApiProperty({
    description: 'Session creation timestamp',
    example: '2026-08-25T12:00:00.000Z',
  })
  createdAt: Date;

  @ApiProperty({
    description:
      'Indicates if this session corresponds to the current caller token',
    example: true,
  })
  isCurrent: boolean;
}

export class RevokeSessionResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Session revoked successfully' })
  message: string;
}

export class RevokeOtherSessionsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 2 })
  revokedCount: number;

  @ApiProperty({ example: 'All other sessions have been revoked' })
  message: string;
}
