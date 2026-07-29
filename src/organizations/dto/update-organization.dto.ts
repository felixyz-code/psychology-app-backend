import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCALE_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

function trimToUndefined({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizeSlug({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function normalizeCurrency({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

export class UpdateOrganizationDto {
  @ApiPropertyOptional({ example: 'Psychology Practice Legal Name, S.C.' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({ example: 'Psychology Practice' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  displayName?: string;

  @ApiPropertyOptional({ example: 'psychology-practice' })
  @IsOptional()
  @Transform(normalizeSlug)
  @IsString()
  @Matches(ORGANIZATION_SLUG_PATTERN)
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ example: 'America/Hermosillo' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  timezone?: string;

  @ApiPropertyOptional({ example: 'es-MX' })
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @Matches(LOCALE_PATTERN)
  @MaxLength(20)
  locale?: string;

  @ApiPropertyOptional({ example: 'MXN' })
  @IsOptional()
  @Transform(normalizeCurrency)
  @IsString()
  @Matches(CURRENCY_PATTERN)
  @MaxLength(3)
  currency?: string;
}
