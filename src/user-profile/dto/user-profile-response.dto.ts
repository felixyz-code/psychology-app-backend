import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PsychologistProfileStatus, UserRole } from '@prisma/client';

export class UserProfileResponseDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  id: string;

  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  userId: string;

  @ApiProperty({ example: 'maria.rivera@example.com' })
  email: string;

  @ApiProperty({ enum: UserRole, example: UserRole.PSYCHOLOGIST })
  role: UserRole;

  @ApiProperty({ example: 'Lic. María Elena Rivera' })
  professionalName: string;

  @ApiPropertyOptional({ example: '12345678', nullable: true })
  licenseNumber: string | null;

  @ApiPropertyOptional({ example: '+52 55 1234 5678', nullable: true })
  phone: string | null;

  @ApiProperty({
    type: [String],
    example: ['Terapia Cognitivo-Conductual', 'Neuropsicología'],
  })
  specialties: string[];

  @ApiPropertyOptional({
    example: 'Especialista en psicoterapia cognitivo conductual.',
    nullable: true,
  })
  bio: string | null;

  @ApiProperty({
    enum: PsychologistProfileStatus,
    example: PsychologistProfileStatus.ACTIVE,
  })
  status: PsychologistProfileStatus;

  @ApiProperty({ example: false })
  hasAvatar: boolean;

  @ApiProperty({ example: false })
  hasSignature: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-02T00:00:00.000Z' })
  updatedAt: Date;
}
