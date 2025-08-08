import { Injectable, Logger } from '@nestjs/common';
import { Coordinate, NearestPortRequestedEvent } from '@port-finder/shared';
import { LocationCalculationService } from './location-calculation.service';
import { PortCacheService } from './port-cache.service';
import { PortServiceClient } from '../../infrastructure/clients/port.client';
import { EventPublisher } from '../../infrastructure/messaging/event.publisher';

export interface NearestPortResult {
    portId: string;
    name: string;
    code: string;
    country: string;
    coordinate: Coordinate;
    distanceKm: number;
    h3Distance: number;
    h3Index: string;
}

@Injectable()
export class LocationDomainService {
    private readonly logger = new Logger(LocationDomainService.name);

    constructor(
        private readonly locationCalculationService: LocationCalculationService,
        private readonly portCacheService: PortCacheService,
        private readonly eventPublisher: EventPublisher,
        private readonly portServiceClient: PortServiceClient
    ) { }

    async findNearestPort(coordinate: Coordinate, maxRadiusKm: number = Number.POSITIVE_INFINITY): Promise<NearestPortResult | null> {
        const requestId = this.generateRequestId();

        try {
            this.logger.debug(`Finding nearest port for coordinate: ${coordinate.toString()}`);

            // Event yayınla
            const event = new NearestPortRequestedEvent(requestId, coordinate, requestId);
            await this.eventPublisher.publish(event.getPayload());

            // Önce cache'den kontrol et
            const cachedResult = await this.portCacheService.getNearestPortFromCache(coordinate, maxRadiusKm);
            if (cachedResult) {
                this.logger.debug(`Found nearest port from cache: ${cachedResult.code}`);
                return cachedResult;
            }

            // Önce H3 ile bulmaya çalış
            let nearestPort = await this.findNearestPortUsingH3(coordinate, maxRadiusKm);

            // Eğer bulunamadıysa cache'i Port Service verisi ile hydrate et ve tekrar dene
            if (!nearestPort) {
                await this.hydrateCacheAround(coordinate, Math.min(maxRadiusKm, 200));
                nearestPort = await this.findNearestPortUsingH3(coordinate, maxRadiusKm);
            }

            if (nearestPort) {
                // Sonucu cache'le
                await this.portCacheService.cacheNearestPortResult(coordinate, nearestPort, maxRadiusKm);
                this.logger.debug(`Found nearest port: ${nearestPort.code} at distance ${nearestPort.distanceKm}km`);
            } else {
                this.logger.debug(`No port found within ${maxRadiusKm}km radius`);
            }

            return nearestPort;
        } catch (error) {
            this.logger.error(`Error finding nearest port: ${error.message}`, error.stack);
            throw error;
        }
    }

    private async findNearestPortUsingH3(coordinate: Coordinate, maxRadiusKm: number): Promise<NearestPortResult | null> {
        // H3 index hesapla
        const h3Index = this.locationCalculationService.coordinateToH3(coordinate);

        // H3 disk ile komşu halkaları büyüterek ara
        let ports: any[] = [];
        let ring = 0;
        const maxRing = Number.isFinite(maxRadiusKm)
            ? this.locationCalculationService.calculateRequiredH3Rings(maxRadiusKm)
            : 10; // güvenli üst sınır
        while (ring <= maxRing && ports.length === 0) {
            const cells = this.locationCalculationService.getH3Neighbors(h3Index, ring);
            for (const cell of cells) {
                const cellPorts = await this.portCacheService.getPortsByH3Index(cell);
                if (cellPorts.length > 0) ports.push(...cellPorts);
            }
            ring++;
        }

        // Mesafeleri hesapla ve en yakınını bul
        let nearestPort: NearestPortResult | null = null;
        let minDistance = Infinity;

        for (const port of ports) {
            const h3Distance = this.locationCalculationService.calculateH3Distance(h3Index, port.h3Index);
            // H3 grid mesafesi birincil kriter; eşitlik bozulur ise Haversine ile tie-break
            const distance = this.locationCalculationService.calculateDistance(coordinate, port.coordinate);
            const score = h3Distance * 1000 + distance; // h3Distance >> distance olacak şekilde ağırlandırma

            if (score < minDistance && (Number.isFinite(maxRadiusKm) ? distance <= maxRadiusKm : true)) {
                nearestPort = {
                    portId: port.id,
                    name: port.name,
                    code: port.code,
                    country: port.country,
                    coordinate: port.coordinate,
                    distanceKm: distance,
                    h3Distance,
                    h3Index: port.h3Index
                };
                minDistance = score;
            }
        }

        return nearestPort;
    }

    private async hydrateCacheAround(coordinate: Coordinate, radiusKm: number): Promise<void> {
        const nearby = await this.portServiceClient.findNearbyPorts({
            coordinate: { latitude: coordinate.latitude, longitude: coordinate.longitude },
            radiusKm
        });

        if (!nearby || nearby.length === 0) return;

        for (const p of nearby) {
            const portCoord = new Coordinate(p.coordinate.latitude, p.coordinate.longitude);
            const h3Index = this.locationCalculationService.coordinateToH3(portCoord);
            await this.portCacheService.cachePort({
                id: p.id,
                name: p.name,
                code: p.code,
                country: p.country,
                coordinate: portCoord,
                h3Index,
                isActive: true
            });
        }
    }

    async findPortsInRadius(coordinate: Coordinate, radiusKm: number): Promise<NearestPortResult[]> {
        try {
            this.logger.debug(`Finding ports within ${radiusKm}km of coordinate: ${coordinate.toString()}`);

            // H3 tabanlı arama
            const h3Index = this.locationCalculationService.coordinateToH3(coordinate);

            // Radius'a göre kaç H3 ring gerekli hesapla
            const ringCount = this.locationCalculationService.calculateRequiredH3Rings(radiusKm);
            const h3Cells = this.locationCalculationService.getH3Neighbors(h3Index, ringCount);

            const allPorts: any[] = [];

            // Tüm H3 cell'lerden portları topla
            for (const cellIndex of h3Cells) {
                const cellPorts = await this.portCacheService.getPortsByH3Index(cellIndex);
                allPorts.push(...cellPorts);
            }

            // Mesafeleri hesapla ve filtrele
            const portsInRadius: NearestPortResult[] = [];

            for (const port of allPorts) {
                const distance = this.locationCalculationService.calculateDistance(coordinate, port.coordinate);

                if (distance <= radiusKm) {
                    const h3Distance = this.locationCalculationService.calculateH3Distance(h3Index, port.h3Index);

                    portsInRadius.push({
                        portId: port.id,
                        name: port.name,
                        code: port.code,
                        country: port.country,
                        coordinate: port.coordinate,
                        distanceKm: distance,
                        h3Distance,
                        h3Index: port.h3Index
                    });
                }
            }

            // Mesafeye göre sırala
            portsInRadius.sort((a, b) => a.distanceKm - b.distanceKm);

            this.logger.debug(`Found ${portsInRadius.length} ports within ${radiusKm}km radius`);
            return portsInRadius;
        } catch (error) {
            this.logger.error(`Error finding ports in radius: ${error.message}`, error.stack);
            throw error;
        }
    }

    async validateCoordinate(coordinate: Coordinate): Promise<boolean> {
        return this.locationCalculationService.isValidCoordinate(coordinate);
    }

    async getLocationInfo(coordinate: Coordinate): Promise<{
        h3Index: string;
        h3Resolution: number;
        nearbyH3Cells: string[];
    }> {
        const h3Index = this.locationCalculationService.coordinateToH3(coordinate);
        const neighbors = this.locationCalculationService.getH3Neighbors(h3Index, 1);

        return {
            h3Index,
            h3Resolution: this.locationCalculationService.getH3Resolution(),
            nearbyH3Cells: neighbors
        };
    }

    private generateRequestId(): string {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}
