import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ReversalService } from './reversal.service';
import { ReverseCollectionDto } from './dto/reverse-collection.dto';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

@ApiTags('reversals')
@Controller('reversals')
export class ReversalController {
  constructor(private readonly reversalService: ReversalService) {}

  @Post()
  @RequirePermission('collection.reverse')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Reverse a collection with compensating entries' })
  @ApiResponse({ status: 201, description: 'Collection reversed successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 404, description: 'Collection not found' })
  @ApiResponse({ status: 409, description: 'Collection already reversed' })
  @ApiResponse({ status: 422, description: 'Business rule violation (e.g., cannot reverse a reversal)' })
  async reverseCollection(
    @Body() dto: ReverseCollectionDto,
    @Req() req: { user: { sub: string; role: string } },
  ) {
    return this.reversalService.reverseCollection(dto, req.user.sub, req.user.role);
  }
}
