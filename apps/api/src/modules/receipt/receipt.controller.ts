import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReceiptService } from './receipt.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ListReceiptsDto } from './dto/list-receipts.dto';

@ApiTags('receipts')
@Controller('receipts')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

  @Get()
  @RequirePermission('receipt.read')
  @ApiOperation({ summary: 'List receipts with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of receipts' })
  async listReceipts(@Query() query: ListReceiptsDto) {
    return this.receiptService.listReceipts({
      loanId: query.loanId,
      customerId: query.customerId,
      receiptNumber: query.receiptNumber,
      skip: query.skip ?? 0,
      take: query.take ?? 20,
    });
  }

  @Get(':id')
  @RequirePermission('receipt.read')
  @ApiOperation({ summary: 'Get receipt by ID' })
  @ApiResponse({ status: 200, description: 'Receipt details' })
  @ApiResponse({ status: 404, description: 'Receipt not found' })
  async getReceipt(@Param('id', ParseUUIDPipe) id: string) {
    return this.receiptService.getReceiptById(id);
  }

  @Get(':id/print')
  @RequirePermission('receipt.print')
  @ApiOperation({ summary: 'Get receipt in printable format (thermal/A4)' })
  @ApiResponse({ status: 200, description: 'Printable receipt data' })
  @ApiResponse({ status: 404, description: 'Receipt not found' })
  async getReceiptForPrint(@Param('id', ParseUUIDPipe) id: string) {
    return this.receiptService.getReceiptForPrint(id);
  }
}
