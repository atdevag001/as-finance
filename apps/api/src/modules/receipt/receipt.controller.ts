import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReceiptService } from './receipt.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('receipts')
@Controller('receipts')
export class ReceiptController {
  constructor(private readonly receiptService: ReceiptService) {}

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
