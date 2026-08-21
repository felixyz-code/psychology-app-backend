import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type UserAssetRowState = 'ABSENT' | 'PRESENT';

export class UserAssetResponseDto {
  @ApiProperty({ enum: ['ABSENT', 'PRESENT'], example: 'PRESENT' })
  rowState: UserAssetRowState;

  @ApiPropertyOptional({ example: 'image/png', nullable: true })
  mimeType: string | null;

  @ApiPropertyOptional({ example: 102400, nullable: true })
  byteSize: number | null;

  @ApiPropertyOptional({ example: 400, nullable: true })
  width: number | null;

  @ApiPropertyOptional({ example: 400, nullable: true })
  height: number | null;

  @ApiPropertyOptional({ example: '2026-08-19T00:00:00.000Z', nullable: true })
  updatedAt: Date | null;
}
