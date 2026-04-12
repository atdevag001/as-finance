import { Controller, Post, Get, Body, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { PostCollectionDto } from './dto/post-collection.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('collections')
@Controller('collections')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

  @Get()
  @RequirePermission('collection.read')
  @ApiOperation({ summary: 'List collections with pagination and filters' })
  @ApiQuery({ name: 'loanId', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'loanNumber', required: false })
  @ApiResponse({ status: 200, description: 'List of collections' })
  async listCollections(
    @Query('loanId') loanId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('loanNumber') loanNumber?: string,
  ) {
    return this.collectionService.listCollections({
      loanId,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 20,
      startDate,
      endDate,
      loanNumber,
    });
  }

  @Post()
  @RequirePermission('collection.create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post a collection (payment) against a loan' })
  @ApiResponse({ status: 201, description: 'Collection posted successfully' })
  @ApiResponse({ status: 400, description: 'Validation or business rule error' })
  @ApiResponse({ status: 404, description: 'Loan not found' })
  @ApiResponse({ status: 409, description: 'Duplicate collection (idempotency)' })
  async postCollection(
    @Body() dto: PostCollectionDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.collectionService.postCollection(dto, req.user.sub, req.user.role);
  }
}
