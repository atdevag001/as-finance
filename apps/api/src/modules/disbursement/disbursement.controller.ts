import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DisbursementService } from './disbursement.service';
import { DisburseDto } from './dto/disburse.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('disbursements')
@Controller('disbursements')
export class DisbursementController {
  constructor(private readonly disbursementService: DisbursementService) {}

  @Post()
  @RequirePermission('loan.disburse')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Disburse an approved loan' })
  @ApiResponse({ status: 201, description: 'Loan disbursed successfully' })
  @ApiResponse({ status: 400, description: 'Prerequisite check failed' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({ status: 409, description: 'Duplicate disbursement (idempotency)' })
  async disburse(
    @Body() dto: DisburseDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.disbursementService.disburse(dto, req.user.sub, req.user.role);
  }
}
