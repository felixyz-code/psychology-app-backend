import { ApiProperty } from '@nestjs/swagger';
import { TeleconsultationRoomStatus } from '@prisma/client';

export class TeleconsultationAccessResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id: string;

  @ApiProperty({ example: 'a1b2c3d4e5f67890' })
  roomCode: string;

  @ApiProperty({ example: 'internal' })
  provider: string;

  @ApiProperty({ enum: TeleconsultationRoomStatus, example: 'ACTIVE' })
  status: TeleconsultationRoomStatus;

  @ApiProperty({ example: '2026-08-24T18:00:00.000Z' })
  expiresAt: string;

  @ApiProperty({ example: '2026-08-24T17:00:00.000Z' })
  scheduledAt: string;

  @ApiProperty({ example: 60 })
  durationMinutes: number;

  @ApiProperty({ example: 'PsiqueOS Clínica Central' })
  organizationName: string;

  @ApiProperty({ example: 'Dr. Carlos Mendoza' })
  psychologistName: string;

  @ApiProperty({ example: 'Ana Sofía Rodríguez' })
  patientName: string;
}
