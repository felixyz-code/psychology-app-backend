import { OrganizationStatus } from '@prisma/client';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export class ChangeOrganizationStatusDto {
  @ApiProperty({
    enum: [OrganizationStatus.ACTIVE, OrganizationStatus.SUSPENDED],
  })
  @IsEnum(OrganizationStatus)
  status: 'ACTIVE' | 'SUSPENDED';
}
