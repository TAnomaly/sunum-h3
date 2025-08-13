import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
        private readonly portServiceClient: PortServiceClient,
        private readonly configService: ConfigService
    ) { }

    async findNearestPort(coordinate: Coordinate, maxRadiusKm: number = Number.POSITIVE_INFINITY): Promise<NearestPortResult | null> {
        const requestId = this.generateRequestId();

        try {
            this.logger.debug(`Finding nearest port for coordinate: ${coordinate.toString()}`);

            // Event yayınla
            const event = new NearestPortRequestedEvent(requestId, coordinate, requestId);
            await this.eventPublisher.publish(event.getPayload());

            const h3OnlyEnv = this.configService.get<string>('LOCATION_H3_ONLY');
            const isH3Only = h3OnlyEnv === undefined || h3OnlyEnv.toLowerCase() === 'true';

            // Önce cache'den kontrol et (H3-only modunda eski fallback sonuçlarını kullanmamak için atla)
            if (!isH3Only) {
                const cachedResult = await this.portCacheService.getNearestPortFromCache(coordinate, maxRadiusKm);
                if (cachedResult) {
                    this.logger.debug(`Found nearest port from cache: ${cachedResult.code} - validating...`);

                    // CRITICAL: Cached result must also pass staleness guard
                    try {
                        const exists = await this.portServiceClient.getPortById(cachedResult.portId);
                        if (exists) {
                            this.logger.debug(`✅ Cached port ${cachedResult.portId} validated in DB`);
                            return cachedResult;
                        } else {
                            this.logger.warn(`⚠️  STALE CACHE: Cached port ${cachedResult.portId} (${cachedResult.code}) missing in DB - invalidating`);
                            await this.portCacheService.invalidatePortCache(cachedResult.portId);
                            await this.portCacheService.invalidateNearestPortCache(coordinate);
                            if (cachedResult.h3Index) {
                                await this.portCacheService.invalidateH3IndexCache(cachedResult.h3Index);
                            }
                            // Continue with fresh search below
                        }
                    } catch (e) {
                        this.logger.warn(`Cached port validation failed: ${(e as any)?.message} - invalidating cache`);
                        await this.portCacheService.invalidateNearestPortCache(coordinate);
                        // Continue with fresh search below
                    }
                }
            }

            // Önce H3 ile bulmaya çalış (ring tabanlı, lokal cache üzerinden)
            let nearestPort = await this.findNearestPortUsingH3(coordinate, maxRadiusKm);

            // H3-only modu: fallback devre dışı
            if (!nearestPort) {
                if (!isH3Only) {
                    this.logger.debug('H3 cache empty, trying fallback with progressive radius');

                    // Progressive radius search - start small and expand
                    const fallbackRadii = Number.isFinite(maxRadiusKm)
                        ? [Math.min(maxRadiusKm, 50), Math.min(maxRadiusKm, 200), Math.min(maxRadiusKm, 500)]
                        : [50, 200, 500, 1000, 2000, 5000, 10000]; // 10,000km covers most of the world

                    for (const radius of fallbackRadii) {
                        this.logger.debug(`Trying fallback with radius: ${radius}km`);
                        const fromPortService = await this.findNearestViaPortService(coordinate, radius);
                        if (fromPortService) {
                            this.logger.debug(`Found port via fallback: ${fromPortService.code} at ${fromPortService.distanceKm}km`);
                            nearestPort = fromPortService;
                            break;
                        }
                    }

                    if (!nearestPort) {
                        this.logger.debug('No port found even with fallback mechanism');
                    }
                }
            }

            if (nearestPort) {
                // Staleness guard: ALWAYS verify the port still exists in DB (critical for manual DB changes)
                this.logger.debug(`Validating port ${nearestPort.portId} exists in DB`);
                try {
                    const exists = await this.portServiceClient.getPortById(nearestPort.portId);
                    if (!exists) {
                        this.logger.warn(`⚠️  STALE DATA: Port ${nearestPort.portId} (${nearestPort.code}) missing in DB - invalidating caches`);
                        await this.portCacheService.invalidatePortCache(nearestPort.portId);
                        if (nearestPort.h3Index) {
                            await this.portCacheService.invalidateH3IndexCache(nearestPort.h3Index);
                        }
                        // Clear nearest cache for this coordinate too
                        await this.portCacheService.invalidateNearestPortCache(coordinate);

                        // Force a re-run with clean cache
                        nearestPort = null;
                        this.logger.debug('Re-running search after cache invalidation');
                        nearestPort = await this.findNearestPortUsingH3(coordinate, maxRadiusKm);
                    } else {
                        this.logger.debug(`✅ Port ${nearestPort.portId} validated in DB`);
                    }
                } catch (e) {
                    this.logger.warn(`DB validation failed: ${(e as any)?.message} - treating as missing`);
                    nearestPort = null;
                }

                if (nearestPort) {
                    // Sonucu cache'le
                    await this.portCacheService.cacheNearestPortResult(coordinate, nearestPort, maxRadiusKm);
                    this.logger.debug(`Found nearest port: ${nearestPort.code} at distance ${nearestPort.distanceKm}km`);
                }
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
        // H3 ile index hesaplayip ring tabanli searc yapiyoruz
        const h3Index = this.locationCalculationService.coordinateToH3(coordinate);

        // H3 ring ile komşu halkaları büyüterek ara
        let ports: any[] = [];
        let ring = 0;
        // CRITICAL: Her zaman maksimum 10 ring ile sınırla
        const calculatedRings = Number.isFinite(maxRadiusKm)
            ? this.locationCalculationService.calculateRequiredH3Rings(maxRadiusKm)
            : 10;
        const maxRing = Math.min(calculatedRings, 10); // Asla 10 ring'den fazla gitme

        this.logger.debug(`H3 search: calculated rings=${calculatedRings}, maxRing=${maxRing}, maxRadiusKm=${maxRadiusKm}`);

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
            const distance = this.locationCalculationService.calculateDistance(coordinate, port.coordinate);
            const score = h3Distance * 1000 + distance;

            // CRITICAL: H3 mesafesi 10 ring'i geçemez VE km mesafesi limiti
            const isWithinH3RingLimit = h3Distance <= 10;
            const isWithinKmLimit = Number.isFinite(maxRadiusKm) ? distance <= maxRadiusKm : true;

            if (!isWithinH3RingLimit) {
                this.logger.debug(`Port ${port.code} rejected: h3Distance=${h3Distance} > 10 rings`);
                continue;
            }

            if (score < minDistance && isWithinH3RingLimit && isWithinKmLimit) {
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

    private async hydrateCacheAround(coordinate: Coordinate, radiusKm: number): Promise<any[]> {
        const nearby = await this.portServiceClient.findNearbyPorts({
            coordinate: { latitude: coordinate.latitude, longitude: coordinate.longitude },
            radiusKm
        });

        if (!nearby || nearby.length === 0) return [];

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

        return nearby;
    }

    private async findNearestViaPortService(coordinate: Coordinate, radiusKm: number): Promise<NearestPortResult | null> {
        // Port Service'den doğrudan yakın limanları al ve en yakını seç
        const nearby = await this.hydrateCacheAround(coordinate, radiusKm);
        if (!nearby || nearby.length === 0) return null;

        const h3Index = this.locationCalculationService.coordinateToH3(coordinate);
        let best: NearestPortResult | null = null;
        let bestScore = Number.POSITIVE_INFINITY;

        for (const p of nearby) {
            const portCoord = new Coordinate(p.coordinate.latitude, p.coordinate.longitude);
            const candidateH3 = this.locationCalculationService.coordinateToH3(portCoord);
            const h3Distance = this.locationCalculationService.calculateH3Distance(h3Index, candidateH3);
            const distance = this.locationCalculationService.calculateDistance(coordinate, portCoord);
            const score = h3Distance * 1000 + distance;

            // CRITICAL: Enforce 10 ring limit in fallback too
            if (h3Distance > 10) {
                this.logger.debug(`Port ${p.code} rejected in fallback: h3Distance=${h3Distance} > 10 rings`);
                continue;
            }

            if (score < bestScore) {
                best = {
                    portId: p.id,
                    name: p.name,
                    code: p.code,
                    country: p.country,
                    coordinate: portCoord,
                    distanceKm: distance,
                    h3Distance,
                    h3Index: candidateH3
                };
                bestScore = score;
            }
        }

        return best;
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
