import {
  Controller,
  Get,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { TeleconsultationService } from './teleconsultation.service';
import { TeleconsultationAccessResponseDto } from './dto/teleconsultation-access-response.dto';

@ApiTags('teleconsultation')
@Controller('teleconsultation')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class TeleconsultationPublicController {
  constructor(
    private readonly teleconsultationService: TeleconsultationService,
  ) {}

  @Get('access/:roomCode')
  @Public()
  @ApiOperation({
    summary:
      'Validate and retrieve public access details of a teleconsultation room for patient',
  })
  @ApiParam({
    name: 'roomCode',
    description: 'Unique 16-character hex teleconsultation room code',
    example: 'a1b2c3d4e5f67890',
  })
  @ApiQuery({
    name: 'token',
    description: 'Ephemeral patient access token',
    required: true,
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Room access granted',
    type: TeleconsultationAccessResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Missing or invalid patient token',
  })
  @ApiNotFoundResponse({
    description: 'Room not found',
  })
  getRoomAccess(
    @Param('roomCode') roomCode: string,
    @Query('token') token: string,
  ) {
    return this.teleconsultationService.getRoomAccess(roomCode, token);
  }
}
