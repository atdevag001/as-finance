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
import { Request } from 'express';
import { LoanProductService } from './loan-product.service';
import { CreateLoanProductDto } from './dto/create-loan-product.dto';
import { UpdateLoanProductDto } from './dto/update-loan-product.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';

@ApiTags('loan-products')
@Controller('loan-products')
export class LoanProductController {
  constructor(private readonly loanProductService: LoanProductService) {}

  @Post()
  @RequirePermission('loan_product.create')
  @ApiOperation({ summary: 'Create a new loan product' })
  @ApiResponse({ status: 201, description: 'Loan product created' })
  @ApiResponse({ status: 409, description: 'Product name already exists' })
  async create(
    @Body() dto: CreateLoanProductDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanProductService.create(dto, req.user.sub, req.user.role);
  }

  @Get()
  @RequirePermission('loan_product.read')
  @ApiOperation({ summary: 'List loan products' })
  async findAll(
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('isActive') isActive?: string,
  ) {
    // Clamp pagination to prevent unbounded queries and reject NaN from parseInt
    const parsedSkip = parseInt(skip ?? '', 10);
    const parsedTake = parseInt(take ?? '', 10);
    const safeSkip = Number.isFinite(parsedSkip) ? Math.max(parsedSkip, 0) : 0;
    const safeTake = Number.isFinite(parsedTake) ? Math.min(Math.max(parsedTake, 1), 100) : 50;
    return this.loanProductService.findAll({
      skip: safeSkip,
      take: safeTake,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('loan_product.read')
  @ApiOperation({ summary: 'Get loan product by ID' })
  @ApiResponse({ status: 200, description: 'Loan product found' })
  @ApiResponse({ status: 404, description: 'Loan product not found' })
  async findById(@Param('id') id: string) {
    return this.loanProductService.findById(id);
  }

  @Patch(':id')
  @RequirePermission('loan_product.update')
  @ApiOperation({ summary: 'Update loan product (creates new version)' })
  @ApiResponse({ status: 200, description: 'New version created' })
  @ApiResponse({ status: 404, description: 'Loan product not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateLoanProductDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanProductService.update(id, dto, req.user.sub, req.user.role);
  }

  @Post(':id/deactivate')
  @RequirePermission('loan_product.deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a loan product' })
  @ApiResponse({ status: 200, description: 'Loan product deactivated' })
  @ApiResponse({ status: 404, description: 'Loan product not found' })
  async deactivate(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.loanProductService.deactivate(id, req.user.sub, req.user.role);
  }
}
