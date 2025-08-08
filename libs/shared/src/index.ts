// Domain Entities
export * from './domain/entities/port.entity';
export * from './domain/entities/outbox.entity';

// Value Objects
export * from './domain/value-objects/coordinate.vo';

// Events
export * from './domain/events/base.event';
export * from './domain/events/port.events';

// DTOs
export * from './dtos/port.dto';

// Interfaces
export interface IRepository<T> {
    findById(id: string): Promise<T | null>;
    save(entity: T): Promise<T>;
    delete(id: string): Promise<void>;
}

export interface IEventPublisher {
    publish(event: any): Promise<void>;
}

export interface IEventHandler<T = any> {
    handle(event: T): Promise<void>;
}

// Common Types
export interface PaginationOptions {
    page: number;
    limit: number;
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// Error Types
export class DomainError extends Error {
    constructor(message: string, public readonly code?: string) {
        super(message);
        this.name = 'DomainError';
    }
}

export class ValidationError extends DomainError {
    constructor(message: string) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

export class NotFoundError extends DomainError {
    constructor(resource: string, id: string) {
        super(`${resource} with id ${id} not found`, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}
