import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CashbookService } from './cashbook.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateHandoverDto } from './dto/create-handover.dto';
import { VerifyHandoverDto } from './dto/verify-handover.dto';
import { ExpenseQueryDto, HandoverQueryDto, DailySummaryQueryDto } from './dto/cashbook-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('cashbook')
@Controller('cashbook')
export class CashbookController {
  constructor(private readonly cashbookService: CashbookService) {}

  @Post('expenses')
  @RequirePermission('accounting.create_expense')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record an expense with journal entry' })
  @ApiResponse({ status: 201, description: 'Expense recorded' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error' })
  async createExpense(
    @Body() dto: CreateExpenseDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.cashbookService.createExpense(dto, req.user.sub, req.user.role);
  }

  @Get('expenses')
  @RequirePermission('accounting.create_expense')
  @ApiOperation({ summary: 'List expenses with filters' })
  @ApiResponse({ status: 200, description: 'Paginated expense list' })
  async findExpenses(@Query() query: ExpenseQueryDto) {
    return this.cashbookService.findExpenses({
      skip: query.skip,
      take: query.take,
      category: query.category,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Post('handovers')
  @RequirePermission('handover.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record a cash handover' })
  @ApiResponse({ status: 201, description: 'Handover recorded' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async createHandover(
    @Body() dto: CreateHandoverDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.cashbookService.createHandover(dto, req.user.sub, req.user.role);
  }

  @Get('handovers')
  @RequirePermission('accounting.manage_cashbook')
  @ApiOperation({ summary: 'List cash handovers with filters' })
  @ApiResponse({ status: 200, description: 'Paginated handover list' })
  async findHandovers(@Query() query: HandoverQueryDto) {
    return this.cashbookService.findHandovers({
      skip: query.skip,
      take: query.take,
      officerId: query.officerId,
      verificationStatus: query.verificationStatus,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Patch('handovers/:id/verify')
  @RequirePermission('handover.verify')
  @ApiOperation({ summary: 'Verify a cash handover' })
  @ApiResponse({ status: 200, description: 'Handover verified' })
  @ApiResponse({ status: 400, description: 'Business rule error' })
  @ApiResponse({ status: 404, description: 'Handover not found' })
  async verifyHandover(
    @Param('id') id: string,
    @Body() dto: VerifyHandoverDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.cashbookService.verifyHandover(id, dto, req.user.sub, req.user.role);
  }

  @Get('daily-summary')
  @RequirePermission('accounting.manage_cashbook')
  @ApiOperation({ summary: 'Get daily cash summary with reconciliation' })
  @ApiResponse({ status: 200, description: 'Daily cash summary' })
  async getDailySummary(@Query() query: DailySummaryQueryDto) {
    return this.cashbookService.getDailySummary(query.date);
  }
}
