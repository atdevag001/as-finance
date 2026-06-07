import { Controller, Post, Get, Body, Query, Req, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { PostCollectionDto } from './dto/post-collection.dto';
import { CollectionQueryDto } from './dto/collection-query.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('collections')
@Controller('collections')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @RequirePermission('collection.read')
  @ApiOperation({ summary: 'List collections with pagination and filters' })
  @ApiResponse({ status: 200, description: 'List of collections' })
  async listCollections(@Query() query: CollectionQueryDto) {
    return this.collectionService.listCollections({
      loanId: query.loanId,
      skip: query.skip ?? 0,
      take: query.take ?? 20,
      startDate: query.startDate,
      endDate: query.endDate,
      loanNumber: query.loanNumber,
      aadhaarLastFour: query.aadhaarLastFour,
    });
  }

  @Post()
  @RequirePermission('collection.create')
  @ApiOperation({ summary: 'Post a collection (payment) against a loan' })
  @ApiResponse({ status: 201, description: 'Collection posted successfully' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({ status: 409, description: 'Duplicate collection (idempotency)' })
  async postCollection(
    @Body() dto: PostCollectionDto,
    @Req() req: { user: { sub: string; role: string } },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { statusCode, data } = await this.collectionService.postCollection(
      dto,
      req.user.sub,
      req.user.role,
    );
    // Honor cached idempotency status so retries replay their original HTTP code, not a hard-coded 201.
    res.status(statusCode ?? HttpStatus.CREATED);
    return data;
  }
}
