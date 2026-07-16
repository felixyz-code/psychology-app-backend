import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiBody,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  Body,
  Controller,
  Delete,
  Get,
  Query,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/authenticated-user.type';
import { CreateFinancialTransactionDto } from './dto/create-financial-transaction.dto';
import { FindFinancialTransactionsQueryDto } from './dto/find-financial-transactions-query.dto';
import { FinancialTransactionSummaryDto } from './dto/financial-transaction-summary.dto';
import { FinancialTransactionResponseDto } from './dto/financial-transaction-response.dto';
import { UpdateFinancialTransactionDto } from './dto/update-financial-transaction.dto';
import { FinancialTransactionsService } from './financial-transactions.service';

@ApiTags('financial-transactions')
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({
  description: 'Missing, invalid, or expired Bearer JWT',
})
@ApiForbiddenResponse({
  description: 'Authenticated user lacks a permitted role',
})
@Controller('financial-transactions')
@Roles(UserRole.ADMIN, UserRole.PSYCHOLOGIST)
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
  }),
)
export class FinancialTransactionsController {
  constructor(
    private readonly financialTransactionsService: FinancialTransactionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a financial transaction' })
  @ApiBody({ type: CreateFinancialTransactionDto })
  @ApiCreatedResponse({
    description: 'Financial transaction created successfully',
    type: FinancialTransactionResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid financial transaction payload',
  })
  @ApiNotFoundResponse({
    description: 'Related patient, appointment, or user not found',
  })
  create(
    @Body() createFinancialTransactionDto: CreateFinancialTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.financialTransactionsService.create(
      user,
      createFinancialTransactionDto,
    );
  }

  @Get()
  @ApiOperation({ summary: 'List all financial transactions' })
  @ApiOkResponse({
    description: 'Financial transactions retrieved successfully',
    type: FinancialTransactionResponseDto,
    isArray: true,
  })
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindFinancialTransactionsQueryDto,
  ) {
    return this.financialTransactionsService.findAll(user, query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get a basic financial summary' })
  @ApiOkResponse({
    description: 'Financial summary retrieved successfully',
    type: FinancialTransactionSummaryDto,
  })
  getSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: FindFinancialTransactionsQueryDto,
  ) {
    return this.financialTransactionsService.getSummary(user, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a financial transaction by ID' })
  @ApiParam({
    name: 'id',
    description: 'Financial transaction ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Financial transaction retrieved successfully',
    type: FinancialTransactionResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid financial transaction ID' })
  @ApiNotFoundResponse({ description: 'Financial transaction not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.financialTransactionsService.findOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a financial transaction' })
  @ApiParam({
    name: 'id',
    description: 'Financial transaction ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiBody({ type: UpdateFinancialTransactionDto })
  @ApiOkResponse({
    description: 'Financial transaction updated successfully',
    type: FinancialTransactionResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid financial transaction payload or ID',
  })
  @ApiNotFoundResponse({
    description:
      'Financial transaction, patient, appointment, or user not found',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateFinancialTransactionDto: UpdateFinancialTransactionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.financialTransactionsService.update(
      user,
      id,
      updateFinancialTransactionDto,
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a financial transaction' })
  @ApiParam({
    name: 'id',
    description: 'Financial transaction ID',
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @ApiOkResponse({
    description: 'Financial transaction deleted successfully',
    type: FinancialTransactionResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid financial transaction ID' })
  @ApiNotFoundResponse({ description: 'Financial transaction not found' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.financialTransactionsService.remove(user, id);
  }
}
