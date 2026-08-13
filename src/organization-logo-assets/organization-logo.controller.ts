import { createReadStream } from 'node:fs';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { OrganizationStatus } from '@prisma/client';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { RequireCapabilities } from '../tenant-context/authorization/require-capabilities.decorator';
import { CapabilitiesGuard } from '../tenant-context/authorization/capabilities.guard';
import { OrganizationCapability } from '../tenant-context/authorization/organization-capability';
import { AllowedOrganizationStatuses } from '../tenant-context/decorators/allowed-organization-statuses.decorator';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { TenantRequired } from '../tenant-context/decorators/tenant-required.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import {
  LogoMutationPreconditionDto,
  RemoveOrganizationLogoDto,
} from './dto/logo-precondition.dto';
import { OrganizationLogoResponseDto } from './dto/organization-logo-response.dto';
import { OrganizationLogoService } from './organization-logo.service';
import { MAX_ORGANIZATION_LOGO_BYTES } from './organization-logo.validation';

@ApiTags('organizations')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@ApiHeader({
  name: 'X-Organization-Id',
  required: false,
  description:
    'Optional UUID selection hint; server validates active membership.',
})
@TenantRequired()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('organizations/:organizationId/logo')
export class OrganizationLogoController {
  constructor(private readonly logos: OrganizationLogoService) {}

  @Get()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Get protected organization logo metadata' })
  @ApiOkResponse({ type: OrganizationLogoResponseDto })
  @ApiNotFoundResponse({ description: 'Organization not found' })
  metadata(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.logos.getMetadata(organizationId, tenant);
  }

  @Get('content')
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_READ)
  @ApiOperation({ summary: 'Stream protected organization logo bytes' })
  @ApiResponse({
    status: 200,
    content: {
      'image/png': { schema: { type: 'string', format: 'binary' } },
      'image/jpeg': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 304, description: 'Logo unchanged' })
  @ApiNotFoundResponse({ description: 'Organization or logo not found' })
  async content(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @CurrentTenant(true) tenant: TenantContext,
    @Res({ passthrough: true }) response: Response,
  ) {
    const content = await this.logos.getContent(organizationId, tenant);
    response.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('ETag', content.etag);
    response.setHeader('Last-Modified', content.updatedAt.toUTCString());
    if (ifNoneMatch === content.etag) {
      response.status(HttpStatus.NOT_MODIFIED);
      return;
    }
    response.setHeader('Content-Type', content.mimeType);
    response.setHeader('Content-Length', content.byteSize.toString());
    return new StreamableFile(createReadStream(content.absolutePath));
  }

  @Put()
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ORGANIZATION_LOGO_BYTES, files: 1 },
    }),
  )
  @ApiOperation({
    summary:
      'Create or replace a protected organization logo with compare-and-swap',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        expectedRowState: { type: 'string', enum: ['ABSENT'] },
        expectedUpdatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOkResponse({ type: OrganizationLogoResponseDto })
  @ApiBadRequestResponse({
    description: 'Missing file, invalid precondition, or invalid image upload',
  })
  @ApiConflictResponse({ description: 'Stale or concurrent logo mutation' })
  @ApiPayloadTooLargeResponse({ description: 'Logo exceeds 1 MiB' })
  async upload(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: LogoMutationPreconditionDto,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    if (!file) throw new BadRequestException('Logo file is required');
    return this.logos.upload(organizationId, file, dto, tenant);
  }

  @Delete()
  @HttpCode(200)
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @UseGuards(CapabilitiesGuard)
  @RequireCapabilities(OrganizationCapability.ORGANIZATION_MANAGE)
  @ApiOperation({
    summary: 'Remove a protected organization logo with compare-and-swap',
  })
  @ApiOkResponse({ type: OrganizationLogoResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid removal precondition' })
  @ApiConflictResponse({ description: 'Stale or concurrent logo mutation' })
  remove(
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: RemoveOrganizationLogoDto,
    @CurrentTenant(true) tenant: TenantContext,
  ) {
    return this.logos.remove(organizationId, dto, tenant);
  }
}
