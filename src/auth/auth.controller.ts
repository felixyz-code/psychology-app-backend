import {
  ApiBody,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Body, Controller, Get, Post } from '@nestjs/common';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { CurrentTenant } from '../tenant-context/decorators/current-tenant.decorator';
import type { TenantContext } from '../tenant-context/tenant-context.types';
import type { AuthenticatedUser } from './types/authenticated-user.type';

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

  @Get('context')
  @ApiBearerAuth('bearer')
  @ApiHeader({
    name: 'X-Organization-Id',
    required: false,
    description:
      'Optional UUID selection hint; server validates active membership.',
  })
  @ApiOperation({ summary: 'Get the validated current organization context' })
  @ApiForbiddenResponse({ description: 'Authentication is required' })
  currentContext(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentTenant() tenantContext?: TenantContext,
  ) {
    return this.authService.getTenantContext(user, tenantContext);
  }
}
