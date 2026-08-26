import {
  ApiExtraModels,
  ApiBody,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { OrganizationStatus } from '@prisma/client';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { CreateFreelancerBootstrapDto } from './dto/create-freelancer-bootstrap.dto';
import { FreelancerBootstrapResponseDto } from './dto/freelancer-bootstrap-response.dto';
import {
  ForgotPasswordDto,
  ForgotPasswordResponseDto,
} from './dto/forgot-password.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  RevokeOtherSessionsResponseDto,
  RevokeSessionResponseDto,
  UserSessionResponseDto,
} from './dto/user-session-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import { AllowedOrganizationStatuses } from '../tenant-context/decorators/allowed-organization-statuses.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import { FreelancerBootstrapEnabledGuard } from './guards/freelancer-bootstrap-enabled.guard';
import { FreelancerBootstrapThrottleGuard } from './guards/freelancer-bootstrap-throttle.guard';
import { SkipTenantContext } from '../tenant-context/decorators/skip-tenant-context.decorator';
import {
  AuthContextPreferenceResponseDto,
  UpdateAuthContextPreferenceDto,
} from './dto/auth-context-preference.dto';
import { AuthContextResponseV1Dto } from './dto/auth-context-response.dto';

interface RequestWithMetadata {
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}

@ApiTags('auth')
@ApiExtraModels(
  AuthContextResponseV1Dto,
  AuthContextPreferenceResponseDto,
  ForgotPasswordResponseDto,
  UserSessionResponseDto,
  RevokeSessionResponseDto,
  RevokeOtherSessionsResponseDto,
)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Authenticate a user and return a JWT access token and refresh token' })
  @ApiBody({ type: LoginDto })
  @ApiCreatedResponse({
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(
    @Body() loginDto: LoginDto,
    @Req() request: RequestWithMetadata,
  ) {
    const ipAddress = request.ip ?? request.socket?.remoteAddress;
    const userAgent = (request.headers['user-agent'] as string) ?? undefined;
    return this.authService.login(loginDto, ipAddress, userAgent);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({
    summary: 'Rotate refresh token and issue a fresh access token with reuse detection',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({
    description: 'Tokens rotated successfully',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid, expired, or compromised refresh token',
  })
  refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: RequestWithMetadata,
  ) {
    const ipAddress = request.ip ?? request.socket?.remoteAddress;
    const userAgent = (request.headers['user-agent'] as string) ?? undefined;
    return this.authService.rotateRefreshToken(dto, ipAddress, userAgent);
  }

  @Get('sessions')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List all active connected sessions for the authenticated user' })
  @ApiOkResponse({
    description: 'Active sessions retrieved successfully',
    type: [UserSessionResponseDto],
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listActiveSessions(user);
  }

  @Delete('sessions/:id')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Revoke a specific remote session' })
  @ApiParam({ name: 'id', description: 'Session UUID to revoke' })
  @ApiOkResponse({
    description: 'Session revoked successfully',
    type: RevokeSessionResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Session not found' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') sessionId: string,
  ) {
    return this.authService.revokeSession(user, sessionId);
  }

  @Post('sessions/revoke-others')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Revoke all active sessions except the current one' })
  @ApiOkResponse({
    description: 'Other sessions revoked successfully',
    type: RevokeOtherSessionsResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.revokeOtherSessions(user);
  }

  @Post('logout')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Logout and revoke current active session' })
  @ApiOkResponse({
    description: 'Logged out successfully',
    type: RevokeSessionResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.logout(user);
  }

  @Post('forgot-password')
  @Public()
  @ApiOperation({ summary: 'Request password reset instructions' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiOkResponse({
    description: 'Password reset request acknowledged',
    type: ForgotPasswordResponseDto,
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('freelancer-bootstrap')
  @Public()
  @UseGuards(FreelancerBootstrapEnabledGuard, FreelancerBootstrapThrottleGuard)
  @ApiOperation({
    summary:
      'Create a new freelancer user, initial active organization, and active owner membership',
  })
  @ApiBody({ type: CreateFreelancerBootstrapDto })
  @ApiCreatedResponse({
    description: 'Bootstrap completed successfully',
    type: FreelancerBootstrapResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid bootstrap payload' })
  @ApiConflictResponse({
    description: 'Registration could not be completed',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many bootstrap attempts',
  })
  @ApiInternalServerErrorResponse({
    description: 'Unexpected server error',
  })
  freelancerBootstrap(
    @Body() dto: CreateFreelancerBootstrapDto,
    @Req() request: RequestWithMetadata,
  ) {
    const ipAddress =
      request.ip ?? request.socket?.remoteAddress ?? 'unknown-client';
    const userAgent = (request.headers['user-agent'] as string) ?? undefined;
    return this.authService.freelancerBootstrap(dto, ipAddress, userAgent);
  }

  @Get('context')
  @AllowedOrganizationStatuses(
    OrganizationStatus.ACTIVE,
    OrganizationStatus.SUSPENDED,
  )
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description:
      'Optional UUID selection hint; server validates active membership.',
  })
  @ApiOperation({
    summary: 'Get the authenticated V1 tenant context projection',
  })
  @ApiBadRequestResponse({
    description: 'Invalid organization selection header',
  })
  @ApiOkResponse({ type: AuthContextResponseV1Dto })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiForbiddenResponse({
    description: 'Organization selection is not eligible',
  })
  currentContext(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantContext?: TenantContext,
  ) {
    return this.authService.getTenantContext(user, tenantContext);
  }

  @Put('context/preference')
  @SkipTenantContext()
  @ApiBearerAuth('bearer')
  @UsePipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  @ApiOperation({
    summary: 'Persist the preferred organization UX hint',
    description:
      'UX preference only; does not select or authorize tenant access.',
  })
  @ApiBody({ type: UpdateAuthContextPreferenceDto })
  @ApiOkResponse({ type: AuthContextPreferenceResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid preference payload' })
  @ApiUnauthorizedResponse({ description: 'Authentication is required' })
  @ApiNotFoundResponse({
    description: 'Organization is not eligible for this user preference',
  })
  @ApiConflictResponse({
    description: 'Preference update could not be completed safely',
  })
  updateContextPreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAuthContextPreferenceDto,
  ) {
    return this.authService.updatePreferredOrganization(user, dto);
  }
}

