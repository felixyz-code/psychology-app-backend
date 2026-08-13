import { ApiProperty } from '@nestjs/swagger';

export enum OrganizationLogoRowState {
  ABSENT = 'ABSENT',
  PRESENT = 'PRESENT',
}

export class OrganizationLogoResponseDto {
  @ApiProperty({ enum: OrganizationLogoRowState })
  rowState: OrganizationLogoRowState;

  @ApiProperty({ format: 'date-time', nullable: true })
  updatedAt: Date | null;

  @ApiProperty({ nullable: true, enum: ['image/png', 'image/jpeg'] })
  mimeType: 'image/png' | 'image/jpeg' | null;

  @ApiProperty({ nullable: true, minimum: 1 })
  byteSize: number | null;

  @ApiProperty({ nullable: true, minimum: 64, maximum: 2048 })
  width: number | null;

  @ApiProperty({ nullable: true, minimum: 64, maximum: 2048 })
  height: number | null;
}
