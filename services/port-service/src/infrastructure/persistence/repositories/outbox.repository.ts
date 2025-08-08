import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { OutboxEvent, OutboxStatus, IRepository } from '@port-finder/shared';
import { OutboxEventEntity, OutboxStatusEnum } from '../entities/outbox.entity';

@Injectable()
export class OutboxRepository implements IRepository<OutboxEvent> {
    constructor(
        @InjectRepository(OutboxEventEntity)
        private readonly outboxRepository: Repository<OutboxEventEntity>
    ) { }

    async findById(id: string): Promise<OutboxEvent | null> {
        const entity = await this.outboxRepository.findOne({ where: { id } });
        return entity ? this.toDomain(entity) : null;
    }

    async save(outboxEvent: OutboxEvent): Promise<OutboxEvent> {
        const entity = this.toEntity(outboxEvent);
        const savedEntity = await this.outboxRepository.save(entity);
        return this.toDomain(savedEntity);
    }

    async delete(id: string): Promise<void> {
        await this.outboxRepository.delete(id);
    }

    async findPendingEvents(limit: number = 100): Promise<OutboxEvent[]> {
        const entities = await this.outboxRepository.find({
            where: { status: OutboxStatusEnum.PENDING },
            order: { created_at: 'ASC' },
            take: limit
        });
        return entities.map(entity => this.toDomain(entity));
    }

    async findFailedEvents(maxRetries: number = 3): Promise<OutboxEvent[]> {
        const entities = await this.outboxRepository.find({
            where: {
                status: OutboxStatusEnum.FAILED,
                retry_count: LessThan(maxRetries)
            },
            order: { created_at: 'ASC' },
            take: 50
        });
        return entities.map(entity => this.toDomain(entity));
    }

    async deleteOldPublishedEvents(olderThanDays: number = 7): Promise<void> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        await this.outboxRepository.delete({
            status: OutboxStatusEnum.PUBLISHED,
            published_at: LessThan(cutoffDate)
        });
    }

    private toDomain(entity: OutboxEventEntity): OutboxEvent {
        return new OutboxEvent({
            id: entity.id,
            aggregateId: entity.aggregate_id,
            eventType: entity.event_type,
            eventData: entity.event_data,
            status: this.mapStatus(entity.status),
            createdAt: entity.created_at,
            publishedAt: entity.published_at,
            retryCount: entity.retry_count,
            lastError: entity.last_error
        });
    }

    private toEntity(outboxEvent: OutboxEvent): OutboxEventEntity {
        const entity = new OutboxEventEntity();
        entity.id = outboxEvent.id;
        entity.aggregate_id = outboxEvent.aggregateId;
        entity.event_type = outboxEvent.eventType;
        entity.event_data = outboxEvent.eventData;
        entity.status = this.mapStatusToEnum(outboxEvent.status);
        entity.created_at = outboxEvent.createdAt;
        entity.published_at = outboxEvent.publishedAt;
        entity.retry_count = outboxEvent.retryCount;
        entity.last_error = outboxEvent.lastError;
        return entity;
    }

    private mapStatus(status: OutboxStatusEnum): OutboxStatus {
        switch (status) {
            case OutboxStatusEnum.PENDING:
                return OutboxStatus.PENDING;
            case OutboxStatusEnum.PUBLISHED:
                return OutboxStatus.PUBLISHED;
            case OutboxStatusEnum.FAILED:
                return OutboxStatus.FAILED;
            default:
                return OutboxStatus.PENDING;
        }
    }

    private mapStatusToEnum(status: OutboxStatus): OutboxStatusEnum {
        switch (status) {
            case OutboxStatus.PENDING:
                return OutboxStatusEnum.PENDING;
            case OutboxStatus.PUBLISHED:
                return OutboxStatusEnum.PUBLISHED;
            case OutboxStatus.FAILED:
                return OutboxStatusEnum.FAILED;
            default:
                return OutboxStatusEnum.PENDING;
        }
    }
}
