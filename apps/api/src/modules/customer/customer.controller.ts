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
import { CustomerService } from './customer.service';
import { DocumentService } from '../document/document.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { BlacklistDto, ReinstateDto } from './dto/blacklist.dto';
import { CreateFamilyMemberDto } from './dto/create-family-member.dto';
import { CreateGuarantorDto } from './dto/create-guarantor.dto';
import { CustomerQueryDto } from './dto/customer-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { JwtPayload } from '../../common/guards/jwt-auth.guard';

@ApiTags('customers')
@Controller('customers')
export class CustomerController {
  constructor(
    private readonly customerService: CustomerService,
    private readonly documentService: DocumentService,
  ) {}

  @Post()
  @RequirePermission('customer.create')
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created' })
  async create(
    @Body() dto: CreateCustomerDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.customerService.create(dto, req.user.sub, req.user.role);
  }

  @Get()
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'List customers with pagination and filters' })
  async findAll(
    @Query() query: CustomerQueryDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.customerService.findAll(query, req.user.sub, req.user.role);
  }

  @Get(':id')
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiResponse({ status: 200, description: 'Customer found' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async findById(
    @Param('id') id: string,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.customerService.findById(id, req.user.sub, req.user.role);
  }

  @Patch(':id')
  @RequirePermission('customer.update')
  @ApiOperation({ summary: 'Update customer' })
  @ApiResponse({ status: 200, description: 'Customer updated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.customerService.update(id, dto, req.user.sub, req.user.role);
  }

  @Post(':id/blacklist')
  @RequirePermission('customer.blacklist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Blacklist a customer (Manager+ only)' })
  @ApiResponse({ status: 200, description: 'Customer blacklisted' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async blacklist(
    @Param('id') id: string,
    @Body() dto: BlacklistDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.customerService.blacklist(id, dto.reason, req.user.sub, req.user.role);
  }

  @Post(':id/reinstate')
  @RequirePermission('customer.blacklist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reinstate a blacklisted customer (Manager+ only)' })
  @ApiResponse({ status: 200, description: 'Customer reinstated' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async reinstate(
    @Param('id') id: string,
    @Body() dto: ReinstateDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.customerService.reinstate(id, dto.reason, req.user.sub, req.user.role);
  }

  @Post(':id/family-members')
  @RequirePermission('customer.update')
  @ApiOperation({ summary: 'Add a family member to a customer' })
  @ApiResponse({ status: 201, description: 'Family member added' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async addFamilyMember(
    @Param('id') customerId: string,
    @Body() dto: CreateFamilyMemberDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.customerService.addFamilyMember(customerId, dto, req.user.sub, req.user.role);
  }

  @Post(':id/guarantors')
  @RequirePermission('customer.update')
  @ApiOperation({ summary: 'Add a guarantor to a customer' })
  @ApiResponse({ status: 201, description: 'Guarantor added' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async addGuarantor(
    @Param('id') customerId: string,
    @Body() dto: CreateGuarantorDto,
    @Req() req: Request & { user: JwtPayload },
  ) {
    return this.customerService.addGuarantor(customerId, dto, req.user.sub, req.user.role);
  }

  @Get(':id/documents')
  @RequirePermission('customer.read')
  @ApiOperation({ summary: 'Get all documents for a customer' })
  @ApiResponse({ status: 200, description: 'Documents retrieved' })
  async getDocuments(@Param('id') customerId: string) {
    const documents = await this.documentService.getCustomerDocuments(customerId);
    return { data: documents };
  }
}
