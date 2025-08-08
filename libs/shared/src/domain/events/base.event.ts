import { v4 as uuidv4 } from 'uuid';

export abstract class DomainEvent {
    public readonly id: string;
    public readonly aggregateId: string;
    public readonly eventType: string;
    public readonly occurredAt: Date;
    public readonly version: number;

    constructor(aggregateId: string, eventType: string, version: number = 1) {
        this.id = uuidv4();
        this.aggregateId = aggregateId;
        this.eventType = eventType;
        this.occurredAt = new Date();
        this.version = version;
    }

    abstract getPayload(): any;
}

export interface EventMetadata {
    correlationId?: string;
    causationId?: string;
    userId?: string;
    timestamp: Date;
}

export interface EventEnvelope {
    event: DomainEvent;
    metadata: EventMetadata;
}
