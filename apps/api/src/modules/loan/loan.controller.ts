import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { LoanService } from './loan.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { ApproveLoanDto } from './dto/approve-loan.dto';
import { RejectLoanDto } from './dto/reject-loan.dto';
import { LoanQueryDto } from './dto/loan-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';

@ApiTags('loans')
@Controller('loans')
export class LoanController {
  constructor(private readonly loanService: LoanService) {}

  @Post()
  @RequirePermission('loan.create')
  @ApiOperation({ summary: 'Create a new loan application (draft)' })
  @ApiResponse({ status: 201, description: 'Loan created in draft status' })
  async create(
    @Body() dto: CreateLoanDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanService.create(dto, req.user.sub, req.user.role);
  }

  @Get()
  @RequirePermission('loan.read')
  @ApiOperation({ summary: 'List loans with pagination and filters' })
  async findAll(@Query() query: LoanQueryDto) {
    return this.loanService.findAll(query);
  }

  @Get(':id')
  @RequirePermission('loan.read')
  @ApiOperation({ summary: 'Get loan by ID with full details' })
  @ApiResponse({ status: 200, description: 'Loan found' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  async findById(@Param('id') id: string) {
    return this.loanService.findById(id);
  }

  @Post(':id/submit')
  @RequirePermission('loan.submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit a draft loan for review' })
  @ApiResponse({ status: 200, description: 'Loan submitted' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({ status: 422, description: 'Invalid status transition' })
  async submit(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanService.submit(id, req.user.sub, req.user.role);
  }

  @Post(':id/review')
  @RequirePermission('loan.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Move a submitted loan to under_review' })
  @ApiResponse({ status: 200, description: 'Loan moved to under_review' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({ status: 422, description: 'Invalid status transition' })
  async review(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanService.review(id, req.user.sub, req.user.role);
  }

  @Post(':id/approve')
  @RequirePermission('loan.approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve a loan (maker-checker: approver ≠ creator)' })
  @ApiResponse({ status: 200, description: 'Loan approved' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({ status: 422, description: 'Invalid transition or maker-checker violation' })
  async approve(
    @Param('id') id: string,
    @Body() dto: ApproveLoanDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanService.approve(id, dto, req.user.sub, req.user.role);
  }

  @Post(':id/reject')
  @RequirePermission('loan.reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject a loan (requires reason)' })
  @ApiResponse({ status: 200, description: 'Loan rejected' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({ status: 422, description: 'Invalid status transition' })
  async reject(
    @Param('id') id: string,
    @Body() dto: RejectLoanDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanService.reject(id, dto, req.user.sub, req.user.role);
  }

  @Post(':id/close')
  @RequirePermission('loan.close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close a fully repaid loan' })
  @ApiResponse({ status: 200, description: 'Loan closed successfully' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({ status: 422, description: 'Closure prerequisites not met' })
  async close(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanService.closeLoan(id, req.user.sub, req.user.role);
  }
}
