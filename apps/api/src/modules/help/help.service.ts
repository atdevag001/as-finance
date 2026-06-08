import { Injectable, Logger } from '@nestjs/common';
import { SubmitHelpFeedbackDto } from './dto/submit-feedback.dto';

/**
 * Help feedback collection — V1.
 *
 * Feedback is structured-logged so the ops team can grep / pipe to wherever they
 * already collect logs (Loki, Datadog, an SQL view over a log table, whatever).
 *
 * V1.1 will add a dedicated `help_feedback` Prisma model and an admin dashboard.
 * The endpoint contract stays the same so the V1.1 upgrade is a service-layer change only.
 */
@Injectable()
export class HelpService {
  private readonly logger = new Logger(HelpService.name);

  recordFeedback(
    dto: SubmitHelpFeedbackDto,
    context: { actorId: string; actorRole: string; ip: string; requestId: string; appVersion?: string },
  ): { received: true } {
    // Single structured line so it lands in JSON logs as a parseable event.
    this.logger.log({
      event: 'help.feedback',
      chapter: dto.chapter,
      sectionId: dto.sectionId,
      lang: dto.lang,
      vote: dto.vote,
      comment: dto.comment ?? null,
      actorId: context.actorId,
      actorRole: context.actorRole,
      ip: context.ip,
      requestId: context.requestId,
      appVersion: context.appVersion ?? null,
      at: new Date().toISOString(),
    });
    return { received: true };
  }
}
