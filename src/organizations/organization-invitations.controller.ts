import { Controller, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { SkipTenantContext } from '../tenant-context/decorators/skip-tenant-context.decorator';
import { InvitationsService } from './invitations.service';

@ApiTags('organization-invitations')
@ApiBearerAuth('bearer')
@SkipTenantContext()
@Controller('organization-invitations')
export class OrganizationInvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post(':token/accept')
  @ApiOperation({
    summary: 'Accept an invitation bound to the authenticated recipient',
  })
  @ApiNotFoundResponse({ description: 'Invitation not found' })
  @ApiForbiddenResponse({
    description: 'Invitation is not available to this recipient',
  })
  @ApiConflictResponse({
    description: 'Invitation is no longer pending or membership exists',
  })
  accept(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitations.accept(token, user);
  }

  @Post(':token/reject')
  @ApiOperation({
    summary: 'Reject an invitation bound to the authenticated recipient',
  })
  reject(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.invitations.reject(token, user);
  }
}
