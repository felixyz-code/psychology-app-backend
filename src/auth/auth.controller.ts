import {
  ApiBody,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiInternalServerErrorResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { CreateFreelancerBootstrapDto } from './dto/create-freelancer-bootstrap.dto';
import { FreelancerBootstrapResponseDto } from './dto/freelancer-bootstrap-response.dto';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import type { AuthenticatedUser } from './types/authenticated-user.type';
import { UseGuards } from '@nestjs/common';
import { FreelancerBootstrapEnabledGuard } from './guards/freelancer-bootstrap-enabled.guard';
import { FreelancerBootstrapThrottleGuard } from './guards/freelancer-bootstrap-throttle.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'Authenticate a user and return a JWT' })
  @ApiBody({ type: LoginDto })
  @ApiCreatedResponse({
    description: 'Login successful',
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
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
    @Req() request: { ip?: string; socket?: { remoteAddress?: string } },
  ) {
    const ipAddress =
      request.ip ?? request.socket?.remoteAddress ?? 'unknown-client';
    return this.authService.freelancerBootstrap(dto, ipAddress);
  }

  @Get('context')
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description:
      'Optional UUID selection hint; server validates active membership.',
  })
  @ApiOperation({ summary: 'Get the validated current organization context' })
  @ApiBadRequestResponse({
    description: 'Invalid organization selection header',
  })
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
}
