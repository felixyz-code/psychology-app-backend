import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';
import { AppService } from './app.service';

@Controller()
@ApiTags('root')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get the public root response' })
  @ApiOkResponse({
    description: 'Public root response',
    schema: { type: 'string', example: 'Hello World!' },
  })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @Public()
  @ApiTags('health')
  @ApiOperation({ summary: 'Get the public health status' })
  @ApiOkResponse({
    description: 'Public health status',
    schema: {
      type: 'object',
      required: ['status', 'version'],
      properties: {
        status: { type: 'string', example: 'UP' },
        version: { type: 'string', example: '1.0.0' },
      },
    },
  })
  getHealth() {
    return this.appService.getHealth();
  }
}
