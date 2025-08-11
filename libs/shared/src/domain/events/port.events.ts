import { DomainEvent } from './base.event';
import { Coordinate } from '../value-objects/coordinate.vo';

export class PortCreatedEvent extends DomainEvent {
    constructor(
        aggregateId: string,
        public readonly name: string,
        public readonly code: string,
        public readonly country: string,
        public readonly coordinate: Coordinate,
        version: number = 1
    ) {
        super(aggregateId, 'PortCreated', version);
    }

    getPayload(): any {
        return {
            id: this.aggregateId,
            name: this.name,
            code: this.code,
            country: this.country,
            coordinate: this.coordinate.toObject()
        };
    }
}

export class PortUpdatedEvent extends DomainEvent {
    constructor(
        aggregateId: string,
        public readonly name: string,
        public readonly coordinate: Coordinate,
        version: number = 1
    ) {
        super(aggregateId, 'PortUpdated', version);
    }

    getPayload(): any {
        return {
            id: this.aggregateId,
            name: this.name,
            coordinate: this.coordinate.toObject()
        };
    }
}

export class PortH3IndexUpdatedEvent extends DomainEvent {
    constructor(
        aggregateId: string,
        public readonly h3Index: string,
        version: number = 1
    ) {
        super(aggregateId, 'PortH3IndexUpdated', version);
    }

    getPayload(): any {
        return {
            id: this.aggregateId,
            h3Index: this.h3Index
        };
    }
}

export class NearestPortRequestedEvent extends DomainEvent {
    constructor(
        aggregateId: string,
        public readonly requestCoordinate: Coordinate,
        public readonly requestId: string,
        version: number = 1
    ) {
        super(aggregateId, 'NearestPortRequested', version);
    }

    getPayload(): any {
        return {
            requestId: this.requestId,
            coordinate: this.requestCoordinate.toObject()
        };
    }
}

export class PortDeletedEvent extends DomainEvent {
    constructor(
        aggregateId: string,
        public readonly code: string,
        public readonly coordinate?: Coordinate,
        public readonly h3Index?: string,
        version: number = 1
    ) {
        super(aggregateId, 'PortDeleted', version);
    }

    getPayload(): any {
        return {
            id: this.aggregateId,
            code: this.code,
            coordinate: this.coordinate ? this.coordinate.toObject() : undefined,
            h3Index: this.h3Index
        };
    }
}
