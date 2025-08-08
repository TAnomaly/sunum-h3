import { v4 as uuidv4 } from 'uuid';
import { DomainEvent } from '../events/base.event';

export enum OutboxStatus {
    PENDING = 'PENDING',
    PUBLISHED = 'PUBLISHED',
    FAILED = 'FAILED'
}

export interface OutboxEventProperties {
    id?: string;
    aggregateId: string;
    eventType: string;
    eventData: any;
    status?: OutboxStatus;
    createdAt?: Date;
    publishedAt?: Date;
    retryCount?: number;
    lastError?: string;
}

export class OutboxEvent {
    private readonly _id: string;
    private readonly _aggregateId: string;
    private readonly _eventType: string;
    private readonly _eventData: any;
    private _status: OutboxStatus;
    private readonly _createdAt: Date;
    private _publishedAt: Date | null;
    private _retryCount: number;
    private _lastError: string | null;

    constructor(properties: OutboxEventProperties) {
        this._id = properties.id || uuidv4();
        this._aggregateId = properties.aggregateId;
        this._eventType = properties.eventType;
        this._eventData = properties.eventData;
        this._status = properties.status || OutboxStatus.PENDING;
        this._createdAt = properties.createdAt || new Date();
        this._publishedAt = properties.publishedAt || null;
        this._retryCount = properties.retryCount || 0;
        this._lastError = properties.lastError || null;
    }

    // Getters
    get id(): string {
        return this._id;
    }

    get aggregateId(): string {
        return this._aggregateId;
    }

    get eventType(): string {
        return this._eventType;
    }

    get eventData(): any {
        return this._eventData;
    }

    get status(): OutboxStatus {
        return this._status;
    }

    get createdAt(): Date {
        return this._createdAt;
    }

    get publishedAt(): Date | null {
        return this._publishedAt;
    }

    get retryCount(): number {
        return this._retryCount;
    }

    get lastError(): string | null {
        return this._lastError;
    }

    // Business methods
    markAsPublished(): void {
        this._status = OutboxStatus.PUBLISHED;
        this._publishedAt = new Date();
    }

    markAsFailed(error: string): void {
        this._status = OutboxStatus.FAILED;
        this._lastError = error;
        this._retryCount++;
    }

    retry(): void {
        this._status = OutboxStatus.PENDING;
        this._retryCount++;
    }

    static fromDomainEvent(event: DomainEvent): OutboxEvent {
        return new OutboxEvent({
            aggregateId: event.aggregateId,
            eventType: event.eventType,
            eventData: {
                id: event.id,
                aggregateId: event.aggregateId,
                eventType: event.eventType,
                occurredAt: event.occurredAt,
                version: event.version,
                payload: event.getPayload()
            }
        });
    }

    toObject(): any {
        return {
            id: this._id,
            aggregateId: this._aggregateId,
            eventType: this._eventType,
            eventData: this._eventData,
            status: this._status,
            createdAt: this._createdAt,
            publishedAt: this._publishedAt,
            retryCount: this._retryCount,
            lastError: this._lastError
        };
    }
}
