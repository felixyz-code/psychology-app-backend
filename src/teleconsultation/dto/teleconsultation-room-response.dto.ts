import { ApiProperty } from '@nestjs/swagger';
import { TeleconsultationRoomStatus } from '@prisma/client';

export class TeleconsultationRoomResponseDto {
  @ApiProperty({ description: 'Room UUID', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Appointment UUID', format: 'uuid' })
  appointmentId!: string;

  @ApiProperty({ description: 'Organization UUID', format: 'uuid', nullable: true })
  organizationId!: string | null;

  @ApiProperty({ description: 'Unique alphanumeric room code (16 hex chars)' })
  roomCode!: string;

  @ApiProperty({ description: 'Video provider identifier', example: 'internal' })
  provider!: string;

  @ApiProperty({ description: 'Therapist 6-digit numeric passcode' })
  therapistPasscode!: string;

  @ApiProperty({ description: 'Opaque patient access token (UUID v4)' })
  patientToken!: string;

  @ApiProperty({ description: 'ISO-8601 expiration timestamp' })
  expiresAt!: string;

  @ApiProperty({
    enum: ['PENDING', 'ACTIVE', 'EXPIRED', 'TERMINATED'],
    description: 'Lifecycle status of the room',
  })
  status!: TeleconsultationRoomStatus;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}
