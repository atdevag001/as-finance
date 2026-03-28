import { Controller, Post, Body, Param, Get, Req, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PenaltyService } from './penalty.service';
import { CalculatePenaltyDto } from './dto/calculate-penalty.dto';
import { WaivePenaltyDto } from './dto/waive-penalty.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('penalties')
@Controller('penalties')
export class PenaltyController {
  constructor(private readonly penaltyService: PenaltyService) {}

  @Post('calculate')
  @RequirePermission('penalty.calculate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Calculate and post a penalty for an overdue installment' })
  @ApiResponse({ status: 201, description: 'Penalty posted successfully' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error' })
  @ApiResponse({ status: 404, description: 'Loan or installment not found' })
  @ApiResponse({ status: 409, description: 'Duplicate penalty for same period' })
  async calculateAndPost(
    @Body() dto: CalculatePenaltyDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.penaltyService.calculateAndPost(dto, req.user.sub, req.user.role);
  }

  @Post(':id/waive')
  @RequirePermission('penalty.waive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Waive a penalty (maker-checker required)' })
  @ApiResponse({ status: 200, description: 'Penalty waived successfully' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error' })
  @ApiResponse({ status: 404, description: 'Penalty not found' })
  async waivePenalty(
    @Param('id') id: string,
    @Body() dto: WaivePenaltyDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.penaltyService.waivePenalty(id, dto, req.user.sub, req.user.role);
  }

  @Get('loan/:loanId')
  @RequirePermission('penalty.read')
  @ApiOperation({ summary: 'Get all penalties for a loan' })
  @ApiResponse({ status: 200, description: 'Penalties retrieved' })
  async findByLoanId(@Param('loanId') loanId: string) {
    return this.penaltyService.findByLoanId(loanId);
  }

  @Get('loan/:loanId/dpd')
  @RequirePermission('penalty.read')
  @ApiOperation({ summary: 'Get DPD and overdue bucket for a loan' })
  @ApiResponse({ status: 200, description: 'DPD info retrieved' })
  async getLoanDpdInfo(@Param('loanId') loanId: string) {
    return this.penaltyService.getLoanDpdInfo(loanId);
  }

  @Get(':id')
  @RequirePermission('penalty.read')
  @ApiOperation({ summary: 'Get a penalty by ID' })
  @ApiResponse({ status: 200, description: 'Penalty retrieved' })
  @ApiResponse({ status: 404, description: 'Penalty not found' })
  async findById(@Param('id') id: string) {
    return this.penaltyService.findById(id);
  }
}
