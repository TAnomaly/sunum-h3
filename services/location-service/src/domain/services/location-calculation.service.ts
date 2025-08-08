import { Injectable } from '@nestjs/common';
import { latLngToCell, cellToLatLng, gridDistance, gridDisk } from 'h3-js';
import { Coordinate } from '@port-finder/shared';

@Injectable()
export class LocationCalculationService {
    private readonly DEFAULT_RESOLUTION = 7; // ~5km hexagons
    private readonly EARTH_RADIUS_KM = 6371;

    coordinateToH3(coordinate: Coordinate, resolution: number = this.DEFAULT_RESOLUTION): string {
        return latLngToCell(coordinate.latitude, coordinate.longitude, resolution);
    }

    h3ToCoordinate(h3Index: string): Coordinate {
        const [lat, lng] = cellToLatLng(h3Index);
        return new Coordinate(lat, lng);
    }

    calculateH3Distance(h3Index1: string, h3Index2: string): number {
        return gridDistance(h3Index1, h3Index2);
    }

    getH3Neighbors(h3Index: string, radius: number = 1): string[] {
        try {
            // All cells within given grid radius (disk)
            const cells = gridDisk(h3Index, radius);
            // gridDisk returns a flattened array in h3-js v4
            return cells as unknown as string[];
        } catch (error) {
            // Fallback: only the center cell
            return [h3Index];
        }
    }

    calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
        // Haversine formula ile hassas mesafe hesapla
        const dLat = this.toRadians(coord2.latitude - coord1.latitude);
        const dLon = this.toRadians(coord2.longitude - coord1.longitude);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(coord1.latitude)) * Math.cos(this.toRadians(coord2.latitude)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return this.EARTH_RADIUS_KM * c;
    }

    calculateBearing(from: Coordinate, to: Coordinate): number {
        // İki nokta arasındaki yön hesapla (derece)
        const dLon = this.toRadians(to.longitude - from.longitude);
        const lat1 = this.toRadians(from.latitude);
        const lat2 = this.toRadians(to.latitude);

        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

        const bearing = Math.atan2(y, x);
        return (this.toDegrees(bearing) + 360) % 360;
    }

    isValidCoordinate(coordinate: Coordinate): boolean {
        const lat = coordinate.latitude;
        const lng = coordinate.longitude;

        return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

    isCoordinateInBounds(coordinate: Coordinate, bounds: {
        northEast: Coordinate;
        southWest: Coordinate;
    }): boolean {
        return coordinate.latitude <= bounds.northEast.latitude &&
            coordinate.latitude >= bounds.southWest.latitude &&
            coordinate.longitude <= bounds.northEast.longitude &&
            coordinate.longitude >= bounds.southWest.longitude;
    }

    calculateRequiredH3Rings(radiusKm: number): number {
        // H3 resolution 7 için ortalama hexagon edge length ~2.8km
        const avgHexagonEdgeKm = 2.8;
        const ringsNeeded = Math.ceil(radiusKm / avgHexagonEdgeKm);

        // Maksimum 10 ring ile sınırla (performans için)
        return Math.min(ringsNeeded, 10);
    }

    getH3Resolution(): number {
        return this.DEFAULT_RESOLUTION;
    }

    getOptimalResolutionForRadius(radiusKm: number): number {
        // Radius'a göre optimal H3 resolution hesapla
        if (radiusKm <= 1) return 9;    // ~0.5km hexagons
        if (radiusKm <= 5) return 8;    // ~1.2km hexagons  
        if (radiusKm <= 20) return 7;   // ~5km hexagons
        if (radiusKm <= 100) return 6;  // ~14km hexagons
        if (radiusKm <= 500) return 5;  // ~40km hexagons
        return 4; // ~150km hexagons
    }

    calculateBoundingBox(center: Coordinate, radiusKm: number): {
        northEast: Coordinate;
        southWest: Coordinate;
    } {
        // Yaklaşık bounding box hesapla
        const latDelta = radiusKm / 111; // 1 derece lat ≈ 111km
        const lngDelta = radiusKm / (111 * Math.cos(this.toRadians(center.latitude)));

        return {
            northEast: new Coordinate(
                Math.min(90, center.latitude + latDelta),
                Math.min(180, center.longitude + lngDelta)
            ),
            southWest: new Coordinate(
                Math.max(-90, center.latitude - latDelta),
                Math.max(-180, center.longitude - lngDelta)
            )
        };
    }

    interpolateCoordinates(from: Coordinate, to: Coordinate, steps: number): Coordinate[] {
        // İki nokta arasında interpolasyon yap
        const coordinates: Coordinate[] = [];

        for (let i = 0; i <= steps; i++) {
            const ratio = i / steps;
            const lat = from.latitude + (to.latitude - from.latitude) * ratio;
            const lng = from.longitude + (to.longitude - from.longitude) * ratio;
            coordinates.push(new Coordinate(lat, lng));
        }

        return coordinates;
    }

    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }

    private toDegrees(radians: number): number {
        return radians * (180 / Math.PI);
    }
}
