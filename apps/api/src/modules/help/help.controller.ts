import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { getRequestId } from '../../common/middleware/request-id.middleware';
import { HelpService } from './help.service';
import { SubmitHelpFeedbackDto } from './dto/submit-feedback.dto';

@ApiTags('help')
@Controller('help')
export class HelpController {
  constructor(private readonly helpService: HelpService) {}

  @Post('feedback')
  @HttpCode(204)
  @RequirePermission('help.submit_feedback')
  @ApiOperation({ summary: 'Submit feedback (👍 / 👎) on a help section' })
  @ApiResponse({ status: 204, description: 'Feedback recorded' })
  async submitFeedback(
    @Body() dto: SubmitHelpFeedbackDto,
    @Req() req: { user: { sub: string; role: string }; ip?: string },
  ): Promise<void> {
    this.helpService.recordFeedback(dto, {
      actorId: req.user.sub,
      actorRole: req.user.role,
      ip: req.ip ?? '0.0.0.0',
      requestId: getRequestId(),
    });
  }
}
