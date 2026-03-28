import { Controller, Post, Get, Body, Param, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ForeclosureService } from './foreclosure.service';
import { CreateForeclosureQuoteDto } from './dto/create-foreclosure-quote.dto';
import { ExecuteForeclosureDto } from './dto/execute-foreclosure.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('foreclosures')
@Controller('foreclosures')
export class ForeclosureController {
  constructor(private readonly foreclosureService: ForeclosureService) {}

  @Post('quote')
  @RequirePermission('foreclosure.quote')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Generate a foreclosure settlement quote' })
  @ApiResponse({ status: 201, description: 'Foreclosure quote created' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  async createQuote(
    @Body() dto: CreateForeclosureQuoteDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.foreclosureService.createQuote(dto, req.user.sub, req.user.role);
  }

  @Post()
  @RequirePermission('foreclosure.execute')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Execute a foreclosure settlement' })
  @ApiResponse({ status: 201, description: 'Foreclosure settled successfully' })
  @ApiResponse({ status: 400, description: 'Validation, business rule, or expired quote error' })
  @ApiResponse({ status: 404, description: 'Foreclosure or loan not found' })
  async executeForeclosure(
    @Body() dto: ExecuteForeclosureDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.foreclosureService.executeForeclosure(dto, req.user.sub, req.user.role);
  }

  @Get(':id')
  @RequirePermission('foreclosure.quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get foreclosure details by ID' })
  @ApiResponse({ status: 200, description: 'Foreclosure details' })
  @ApiResponse({ status: 404, description: 'Foreclosure not found' })
  async findById(@Param('id') id: string) {
    return this.foreclosureService.findById(id);
  }
}
