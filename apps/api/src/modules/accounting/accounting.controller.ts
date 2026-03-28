import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AccountingService } from './accounting.service';
import {
  DateRangeQueryDto,
  AsOfDateQueryDto,
  JournalEntryQueryDto,
} from './dto/accounting-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('accounting')
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('chart-of-accounts')
  @RequirePermission('accounting.read')
  @ApiOperation({ summary: 'Get chart of accounts' })
  @ApiResponse({ status: 200, description: 'List of all active accounts' })
  async getChartOfAccounts() {
    return this.accountingService.getChartOfAccounts();
  }

  @Get('journal-entries')
  @RequirePermission('accounting.read')
  @ApiOperation({ summary: 'Get journal entries with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated journal entries' })
  async getJournalEntries(@Query() query: JournalEntryQueryDto) {
    return this.accountingService.getJournalEntries({
      skip: query.skip,
      take: query.take,
      sourceType: query.sourceType,
      sourceId: query.sourceId,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('daybook')
  @RequirePermission('accounting.read')
  @ApiOperation({ summary: 'Get daybook (journal entries for date range, chronological)' })
  @ApiResponse({ status: 200, description: 'Journal entries in chronological order' })
  async getDaybook(@Query() query: DateRangeQueryDto) {
    return this.accountingService.getDaybook(query.startDate, query.endDate);
  }

  @Get('trial-balance')
  @RequirePermission('accounting.read')
  @ApiOperation({ summary: 'Get trial balance (sum of debit balances == sum of credit balances)' })
  @ApiResponse({ status: 200, description: 'Trial balance report' })
  async getTrialBalance(@Query() query: AsOfDateQueryDto) {
    return this.accountingService.getTrialBalance(query.asOfDate);
  }

  @Get('profit-loss')
  @RequirePermission('accounting.read')
  @ApiOperation({ summary: 'Get profit & loss statement for date range' })
  @ApiResponse({ status: 200, description: 'Profit and loss report' })
  async getProfitAndLoss(@Query() query: DateRangeQueryDto) {
    return this.accountingService.getProfitAndLoss(query.startDate, query.endDate);
  }

  @Get('balance-sheet')
  @RequirePermission('accounting.read')
  @ApiOperation({ summary: 'Get balance sheet at a point in time' })
  @ApiResponse({ status: 200, description: 'Balance sheet report' })
  async getBalanceSheet(@Query() query: AsOfDateQueryDto) {
    return this.accountingService.getBalanceSheet(query.asOfDate);
  }
}
