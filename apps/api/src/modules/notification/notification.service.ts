import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { NotificationRepository } from './notification.repository';
import { EnqueueNotificationDto } from './dto/enqueue-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { SmsProvider, SMS_PROVIDER } from './sms-provider';
import { renderTemplate } from './render-template';
import { NotFoundError } from '../../common/errors/not-found.error';
import { BusinessRuleError } from '../../common/errors/business-rule.error';

/**
 * Prisma transaction client type — a subset of PrismaService used within
 * `prisma.$transaction()` callbacks.
 */
type TxClient = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Notification service — outbox pattern for async SMS dispatch.
 *
 * Finance transactions enqueue messages within the same DB transaction.
 * A separate background processor dispatches SMS from the outbox.
 * SMS failure never rolls back a valid finance transaction (Requirement 18.4).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly repository: NotificationRepository,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  /**
   * Enqueue a notification message within the same database transaction
   * as the finance operation (Requirement 18.2).
   *
   * Looks up the SMS template for the event type, renders the message body
   * with the provided variables, and creates an outbox record.
   * If the template is not found, uses a fallback message.
   */
  async enqueue(dto: EnqueueNotificationDto, tx?: TxClient) {
    const language = dto.language ?? 'en';
    const template = await this.repository.findTemplate(dto.event_type, language);

    let messageBody: string;
    let templateId: string | undefined;

    if (template) {
      messageBody = renderTemplate(template.template_body, dto.variables);
      templateId = template.id;
    } else {
      // Fallback: construct a basic message from variables
      messageBody = `AS Finance notification: ${dto.event_type}`;
      this.logger.warn({
        msg: 'SMS template not found, using fallback',
        eventType: dto.event_type,
        language,
      });
    }

    const message = await this.repository.create(
      {
        event_type: dto.event_type,
        recipient_mobile: dto.recipient_mobile,
        template_id: templateId,
        message_body: messageBody,
        variables: dto.variables,
        source_type: dto.source_type,
        source_id: dto.source_id,
        max_retries: dto.max_retries ?? 3,
      },
      tx,
    );

    this.logger.log({
      msg: 'Notification enqueued',
      eventType: dto.event_type,
      sourceType: dto.source_type,
      sourceId: dto.source_id,
      messageId: message.id,
    });

    return message;
  }

  /**
   * List outbox messages with filtering and pagination.
   */
  async findAll(query: NotificationQueryDto) {
    return this.repository.findAll({
      skip: query.skip,
      take: query.take,
      status: query.status,
      eventType: query.eventType,
    });
  }

  /**
   * Retry a failed or dead_letter message.
   * Resets the message to pending status for reprocessing.
   */
  async retry(id: string) {
    const message = await this.repository.findById(id);
    if (!message) {
      throw new NotFoundError('Outbox message not found');
    }

    if (message.status !== 'failed' && message.status !== 'dead_letter') {
      throw new BusinessRuleError(
        `Cannot retry message in '${message.status}' status. Only failed or dead_letter messages can be retried.`,
      );
    }

    const updated = await this.repository.resetForRetry(id);

    this.logger.log({
      msg: 'Notification message reset for retry',
      messageId: id,
      previousStatus: message.status,
    });

    return updated;
  }
}
