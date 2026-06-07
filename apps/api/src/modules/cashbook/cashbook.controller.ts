import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiHeader } from '@nestjs/swagger';
import { CashbookService } from './cashbook.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { CreateHandoverDto } from './dto/create-handover.dto';
import { VerifyHandoverDto } from './dto/verify-handover.dto';
import { ExpenseQueryDto, HandoverQueryDto, DailySummaryQueryDto } from './dto/cashbook-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { IdempotencyService } from '../idempotency/idempotency.service';

// Cash + JE side effects are non-reversible, so we require an Idempotency-Key header to dedupe double-clicks/retries.
const IDEMPOTENCY_KEY_MIN = 8;
const IDEMPOTENCY_KEY_MAX = 255;

function assertIdempotencyKey(key: string | undefined): string {
  if (!key || key.length < IDEMPOTENCY_KEY_MIN || key.length > IDEMPOTENCY_KEY_MAX) {
    throw new BadRequestException(
      `Idempotency-Key header is required (length ${IDEMPOTENCY_KEY_MIN}-${IDEMPOTENCY_KEY_MAX})`,
    );
  }
  return key;
}

// Prisma's Json column rejects native BigInt; round-trip through JSON to coerce paise via the global BigInt.toJSON polyfill.
function toJsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

@ApiTags('cashbook')
@Controller('cashbook')
export class CashbookController {
  constructor(
    private readonly cashbookService: CashbookService,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Post('expenses')
  @RequirePermission('accounting.create_expense')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Record an expense with journal entry' })
  @ApiHeader({ name: 'Idempotency-Key', description: 'UUID to dedupe duplicate submissions', required: true })
  @ApiResponse({ status: 201, description: 'Expense recorded' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error' })
  async createExpense(
    @Body() dto: CreateExpenseDto,
    @Req() req: { user: { sub: string; role: string } },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const key = assertIdempotencyKey(idempotencyKey);
    const cached = await this.idempotencyService.find(key);
    if (cached) {
      return cached.resultBody;
    }
    const result = await this.cashbookService.createExpense(dto, req.user.sub, req.user.role);
    // Store outside the service tx — the side effects are already committed; the key just dedupes future retries.
    await this.idempotencyService.store(key, 'cashbook.expense', HttpStatus.CREATED, toJsonSafe(result));
    return result;
  }

  @Get('expenses')
  @RequirePermission('accounting.read')
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
  @ApiHeader({ name: 'Idempotency-Key', description: 'UUID to dedupe duplicate submissions', required: true })
  @ApiResponse({ status: 201, description: 'Handover recorded' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async createHandover(
    @Body() dto: CreateHandoverDto,
    @Req() req: { user: { sub: string; role: string } },
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const key = assertIdempotencyKey(idempotencyKey);
    const cached = await this.idempotencyService.find(key);
    if (cached) {
      return cached.resultBody;
    }
    const result = await this.cashbookService.createHandover(dto, req.user.sub, req.user.role);
    await this.idempotencyService.store(key, 'cashbook.handover', HttpStatus.CREATED, toJsonSafe(result));
    return result;
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
