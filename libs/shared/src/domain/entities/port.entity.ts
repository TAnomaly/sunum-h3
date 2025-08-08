import { v4 as uuidv4 } from 'uuid';
import { Coordinate } from '../value-objects/coordinate.vo';

export interface PortProperties {
    id?: string;
    name: string;
    code: string;
    country: string;
    coordinate: Coordinate;
    h3Index?: string;
    isActive?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

export class Port {
    private readonly _id: string;
    private _name: string;
    private _code: string;
    private _country: string;
    private _coordinate: Coordinate;
    private _h3Index: string;
    private _isActive: boolean;
    private readonly _createdAt: Date;
    private _updatedAt: Date;

    constructor(properties: PortProperties) {
        this._id = properties.id || uuidv4();
        this._name = properties.name;
        this._code = properties.code;
        this._country = properties.country;
        this._coordinate = properties.coordinate;
        this._h3Index = properties.h3Index || '';
        this._isActive = properties.isActive ?? true;
        this._createdAt = properties.createdAt || new Date();
        this._updatedAt = properties.updatedAt || new Date();

        this.validate();
    }

    private validate(): void {
        if (!this._name || this._name.trim().length === 0) {
            throw new Error('Port name is required');
        }
        if (!this._code || this._code.trim().length === 0) {
            throw new Error('Port code is required');
        }
        if (!this._country || this._country.trim().length === 0) {
            throw new Error('Port country is required');
        }
    }

    // Getters
    get id(): string {
        return this._id;
    }

    get name(): string {
        return this._name;
    }

    get code(): string {
        return this._code;
    }

    get country(): string {
        return this._country;
    }

    get coordinate(): Coordinate {
        return this._coordinate;
    }

    get h3Index(): string {
        return this._h3Index;
    }

    get isActive(): boolean {
        return this._isActive;
    }

    get createdAt(): Date {
        return this._createdAt;
    }

    get updatedAt(): Date {
        return this._updatedAt;
    }

    // Business methods
    updateName(name: string): void {
        if (!name || name.trim().length === 0) {
            throw new Error('Port name is required');
        }
        this._name = name;
        this._updatedAt = new Date();
    }

    updateCoordinate(coordinate: Coordinate): void {
        this._coordinate = coordinate;
        this._updatedAt = new Date();
    }

    updateH3Index(h3Index: string): void {
        this._h3Index = h3Index;
        this._updatedAt = new Date();
    }

    activate(): void {
        this._isActive = true;
        this._updatedAt = new Date();
    }

    deactivate(): void {
        this._isActive = false;
        this._updatedAt = new Date();
    }

    toObject(): any {
        return {
            id: this._id,
            name: this._name,
            code: this._code,
            country: this._country,
            coordinate: this._coordinate.toObject(),
            h3Index: this._h3Index,
            isActive: this._isActive,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt
        };
    }
}
