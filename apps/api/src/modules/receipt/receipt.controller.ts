import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ReceiptService } from './receipt.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('receipts')
@Controller('receipts')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Get()
  @RequirePermission('receipt.read')
  @ApiOperation({ summary: 'List receipts with pagination and filters' })
  @ApiQuery({ name: 'loanId', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'take', required: false })
  @ApiResponse({ status: 200, description: 'List of receipts' })
  async listReceipts(
    @Query('loanId') loanId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.receiptService.listReceipts({
      loanId,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
    });
  }

  @Get(':id')
  @RequirePermission('receipt.read')
  @ApiOperation({ summary: 'Get receipt by ID' })
  @ApiResponse({ status: 200, description: 'Receipt details' })
  @ApiResponse({ status: 404, description: 'Receipt not found' })
  async getReceipt(@Param('id') id: string) {
    return this.receiptService.getReceiptById(id);
  }

  @Get(':id/print')
  @RequirePermission('receipt.print')
  @ApiOperation({ summary: 'Get receipt in printable format (thermal/A4)' })
  @ApiResponse({ status: 200, description: 'Printable receipt data' })
  @ApiResponse({ status: 404, description: 'Receipt not found' })
  async getReceiptForPrint(@Param('id') id: string) {
    return this.receiptService.getReceiptForPrint(id);
  }
}
