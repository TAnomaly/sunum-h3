import { IsNumber, Min, Max, validateSync } from 'class-validator';

export class Coordinate {
    @IsNumber({}, { message: 'Latitude must be a number' })
    @Min(-90, { message: 'Latitude must be between -90 and 90' })
    @Max(90, { message: 'Latitude must be between -90 and 90' })
    private readonly _latitude: number;

    @IsNumber({}, { message: 'Longitude must be a number' })
    @Min(-180, { message: 'Longitude must be between -180 and 180' })
    @Max(180, { message: 'Longitude must be between -180 and 180' })
    private readonly _longitude: number;

    constructor(latitude: number, longitude: number) {
        this._latitude = latitude;
        this._longitude = longitude;

        const errors = validateSync(this);
        if (errors.length > 0) {
            throw new Error(`Invalid coordinate: ${errors.map(e => e.toString()).join(', ')}`);
        }
    }

    get latitude(): number {
        return this._latitude;
    }

    get longitude(): number {
        return this._longitude;
    }

    equals(other: Coordinate): boolean {
        return this._latitude === other._latitude && this._longitude === other._longitude;
    }

    toString(): string {
        return `${this._latitude},${this._longitude}`;
    }

    toObject(): { latitude: number; longitude: number } {
        return {
            latitude: this._latitude,
            longitude: this._longitude
        };
    }

    static fromObject(obj: { latitude: number; longitude: number }): Coordinate {
        return new Coordinate(obj.latitude, obj.longitude);
    }
}
