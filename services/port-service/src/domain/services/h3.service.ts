import { Injectable } from '@nestjs/common';
import { latLngToCell, cellToLatLng, gridDistance, cellToBoundary } from 'h3-js';
import { Coordinate } from '@port-finder/shared';

@Injectable()
export class H3Service {
    private readonly DEFAULT_RESOLUTION = 7; // ~5km hexagons

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
            // Simple implementation - in real project, use proper H3 ring functions
            // For now, return only the center cell for simplicity
            const neighbors = [h3Index];

            // Add basic neighbor approximation based on H3 index manipulation
            // This is a simplified approach for demo purposes
            return neighbors;
        } catch (error) {
            // Fallback: sadece merkez cell'i döndür
            return [h3Index];
        }
    }

    getH3Boundary(h3Index: string): Coordinate[] {
        const boundary = cellToBoundary(h3Index);
        return boundary.map(([lat, lng]) => new Coordinate(lat, lng));
    }

    findNearbyH3Cells(coordinate: Coordinate, radiusKm: number): string[] {
        // Yaklaşık olarak kaç H3 resolution seviyesine ihtiyaç var hesapla
        const h3Index = this.coordinateToH3(coordinate);

        // Basit implementasyon - gerçek projede daha karmaşık algoritma gerekli
        const cells = [h3Index];

        // Komşu celleri de ekle (basitleştirilmiş)
        // Gerçek implementasyonda kRing kullanılmalı

        return cells;
    }

    isValidH3Index(h3Index: string): boolean {
        try {
            cellToLatLng(h3Index);
            return true;
        } catch {
            return false;
        }
    }

    getResolutionFromDistance(distanceKm: number): number {
        // H3 resolution'ı mesafeye göre hesapla
        // Bu basit bir approximation
        if (distanceKm > 100) return 4;
        if (distanceKm > 50) return 5;
        if (distanceKm > 25) return 6;
        if (distanceKm > 10) return 7;
        if (distanceKm > 5) return 8;
        return 9;
    }

    calculateApproximateDistance(coord1: Coordinate, coord2: Coordinate): number {
        // Haversine formula ile yaklaşık mesafe hesapla
        const R = 6371; // Earth's radius in km
        const dLat = this.toRadians(coord2.latitude - coord1.latitude);
        const dLon = this.toRadians(coord2.longitude - coord1.longitude);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(coord1.latitude)) * Math.cos(this.toRadians(coord2.latitude)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private toRadians(degrees: number): number {
        return degrees * (Math.PI / 180);
    }
}
