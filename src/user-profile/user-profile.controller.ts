import { createReadStream } from 'node:fs';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiPayloadTooLargeResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { SkipTenantContext } from '../tenant-context/decorators/skip-tenant-context.decorator';
import { UserAssetResponseDto } from './dto/user-asset-response.dto';
import {
  UpdateUserPreferencesDto,
  UserPreferencesResponseDto,
} from './dto/user-preferences.dto';
import { UserProfileResponseDto } from './dto/user-profile-response.dto';
import { UpdateUserProfileDto } from './dto/user-profile.dto';
import { UserProfileService } from './user-profile.service';
import {
  MAX_AVATAR_BYTES,
  MAX_SIGNATURE_BYTES,
} from './user-profile.validation';

@ApiTags('users')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Authentication is required' })
@SkipTenantContext()
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
@Controller('users/me')
export class UserProfileController {
  constructor(private readonly userProfileService: UserProfileService) {}

  @Get('preferences')
  @ApiOperation({ summary: 'Get current authenticated user preferences' })
  @ApiOkResponse({ type: UserPreferencesResponseDto })
  getPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.userProfileService.getPreferences(user.id);
  }

  @Patch('preferences')
  @ApiOperation({
    summary: 'Update user notification, timezone and localization preferences',
  })
  @ApiBody({ type: UpdateUserPreferencesDto })
  @ApiOkResponse({ type: UserPreferencesResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  updatePreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    return this.userProfileService.updatePreferences(user.id, dto);
  }

  @Get('profile')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiOkResponse({ type: UserProfileResponseDto })
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.userProfileService.getProfile(user.id);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Update professional profile details' })
  @ApiBody({ type: UpdateUserProfileDto })
  @ApiOkResponse({ type: UserProfileResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserProfileDto,
  ) {
    return this.userProfileService.updateProfile(user.id, dto);
  }

  @Get('avatar')
  @ApiOperation({ summary: 'Get avatar metadata' })
  @ApiOkResponse({ type: UserAssetResponseDto })
  getAvatarMetadata(@CurrentUser() user: AuthenticatedUser) {
    return this.userProfileService.getAvatarMetadata(user.id);
  }

  @Get('avatar/content')
  @ApiOperation({ summary: 'Stream authenticated user avatar image' })
  @ApiNotFoundResponse({ description: 'Avatar not found' })
  async getAvatarContent(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.userProfileService.getAvatarContent(user.id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.byteSize.toString());
    response.setHeader('Cache-Control', 'private, no-cache');
    return new StreamableFile(createReadStream(file.absolutePath));
  }

  @Put('avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_AVATAR_BYTES },
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload or replace user avatar' })
  @ApiOkResponse({ type: UserAssetResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid image format or dimensions' })
  @ApiPayloadTooLargeResponse({ description: 'Avatar exceeds 2 MiB limit' })
  uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Avatar image file is required');
    return this.userProfileService.uploadAvatar(user.id, file);
  }

  @Delete('avatar')
  @ApiOperation({ summary: 'Remove user avatar' })
  @ApiOkResponse({ type: UserAssetResponseDto })
  removeAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.userProfileService.removeAvatar(user.id);
  }

  @Get('signature')
  @ApiOperation({ summary: 'Get digital signature metadata' })
  @ApiOkResponse({ type: UserAssetResponseDto })
  getSignatureMetadata(@CurrentUser() user: AuthenticatedUser) {
    return this.userProfileService.getSignatureMetadata(user.id);
  }

  @Get('signature/content')
  @ApiOperation({
    summary: 'Stream authenticated user digital signature image',
  })
  @ApiNotFoundResponse({ description: 'Signature not found' })
  async getSignatureContent(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const file = await this.userProfileService.getSignatureContent(user.id);
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.byteSize.toString());
    response.setHeader('Cache-Control', 'private, no-cache');
    return new StreamableFile(createReadStream(file.absolutePath));
  }

  @Put('signature')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_SIGNATURE_BYTES },
      storage: memoryStorage(),
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload or replace user digital signature' })
  @ApiOkResponse({ type: UserAssetResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid signature image' })
  @ApiPayloadTooLargeResponse({ description: 'Signature exceeds 1 MiB limit' })
  uploadSignature(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file)
      throw new BadRequestException('Signature image file is required');
    return this.userProfileService.uploadSignature(user.id, file);
  }

  @Delete('signature')
  @ApiOperation({ summary: 'Remove user digital signature' })
  @ApiOkResponse({ type: UserAssetResponseDto })
  removeSignature(@CurrentUser() user: AuthenticatedUser) {
    return this.userProfileService.removeSignature(user.id);
  }
}
