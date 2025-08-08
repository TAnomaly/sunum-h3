import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DomainEvent, OutboxEvent } from '@port-finder/shared';
import { OutboxRepository } from '../../infrastructure/persistence/repositories/outbox.repository';
import { EventPublisher } from '../../infrastructure/messaging/event.publisher';

@Injectable()
export class OutboxService {
    private readonly logger = new Logger(OutboxService.name);

    constructor(
        private readonly outboxRepository: OutboxRepository,
        private readonly eventPublisher: EventPublisher
    ) { }

    async saveEvent(event: DomainEvent): Promise<void> {
        const outboxEvent = OutboxEvent.fromDomainEvent(event);
        await this.outboxRepository.save(outboxEvent);
        this.logger.debug(`Event saved to outbox: ${event.eventType} for aggregate ${event.aggregateId}`);
    }

    @Cron(CronExpression.EVERY_10_SECONDS)
    async processOutboxEvents(): Promise<void> {
        try {
            const pendingEvents = await this.outboxRepository.findPendingEvents(50);

            if (pendingEvents.length === 0) {
                return;
            }

            this.logger.debug(`Processing ${pendingEvents.length} outbox events`);

            for (const outboxEvent of pendingEvents) {
                try {
                    await this.eventPublisher.publish(outboxEvent.eventData);

                    outboxEvent.markAsPublished();
                    await this.outboxRepository.save(outboxEvent);

                    this.logger.debug(`Event published: ${outboxEvent.eventType} for aggregate ${outboxEvent.aggregateId}`);
                } catch (error) {
                    this.logger.error(`Failed to publish event ${outboxEvent.id}:`, error);

                    outboxEvent.markAsFailed(error.message);
                    await this.outboxRepository.save(outboxEvent);
                }
            }
        } catch (error) {
            this.logger.error('Error processing outbox events:', error);
        }
    }

    @Cron(CronExpression.EVERY_5_MINUTES)
    async retryFailedEvents(): Promise<void> {
        try {
            const failedEvents = await this.outboxRepository.findFailedEvents(3);

            if (failedEvents.length === 0) {
                return;
            }

            this.logger.debug(`Retrying ${failedEvents.length} failed events`);

            for (const outboxEvent of failedEvents) {
                try {
                    await this.eventPublisher.publish(outboxEvent.eventData);

                    outboxEvent.markAsPublished();
                    await this.outboxRepository.save(outboxEvent);

                    this.logger.debug(`Failed event retried successfully: ${outboxEvent.eventType}`);
                } catch (error) {
                    this.logger.error(`Retry failed for event ${outboxEvent.id}:`, error);

                    outboxEvent.markAsFailed(error.message);
                    await this.outboxRepository.save(outboxEvent);
                }
            }
        } catch (error) {
            this.logger.error('Error retrying failed events:', error);
        }
    }

    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async cleanupOldEvents(): Promise<void> {
        try {
            await this.outboxRepository.deleteOldPublishedEvents(7);
            this.logger.debug('Old published events cleaned up');
        } catch (error) {
            this.logger.error('Error cleaning up old events:', error);
        }
    }

    async getOutboxStats(): Promise<{
        pending: number;
        published: number;
        failed: number;
    }> {
        // Bu method istatistikler için kullanılabilir
        // Şimdilik basit bir implementasyon
        return {
            pending: 0,
            published: 0,
            failed: 0
        };
    }
}
