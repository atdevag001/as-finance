import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CollectionService } from './collection.service';
import { PostCollectionDto } from './dto/post-collection.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('collections')
@Controller('collections')
export class CollectionController {
  constructor(private readonly collectionService: CollectionService) {}

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
