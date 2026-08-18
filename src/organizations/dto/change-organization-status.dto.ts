import { OrganizationStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

const ADMINISTRABLE_ORGANIZATION_STATUSES = [
  OrganizationStatus.ACTIVE,
  OrganizationStatus.SUSPENDED,
] as const;

export class ChangeOrganizationStatusDto {
  @ApiProperty({
    enum: ADMINISTRABLE_ORGANIZATION_STATUSES,
  })
  @IsIn(ADMINISTRABLE_ORGANIZATION_STATUSES)
  status: 'ACTIVE' | 'SUSPENDED';
}
