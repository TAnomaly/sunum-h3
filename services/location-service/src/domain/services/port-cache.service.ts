import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Coordinate } from '@port-finder/shared';
import { NearestPortResult } from './location.domain-service';

export interface CachedPort {
    id: string;
    name: string;
    code: string;
    country: string;
    coordinate: Coordinate;
    h3Index: string;
    isActive: boolean;
}

@Injectable()
export class PortCacheService {
    private readonly logger = new Logger(PortCacheService.name);
    private readonly CACHE_TTL = 3600; // 1 hour in seconds
    private readonly NEAREST_PORT_CACHE_TTL = 1800; // 30 minutes
    private readonly H3_INDEX_CACHE_TTL = 7200; // 2 hours

    constructor(
        @Inject(CACHE_MANAGER) private readonly cacheManager: Cache
    ) { }

    async cachePort(port: CachedPort): Promise<void> {
        try {
            const cacheKey = this.getPortCacheKey(port.id);
            await this.cacheManager.set(cacheKey, port, this.CACHE_TTL);

            // H3 index ile de cache'le
            const h3Key = this.getH3IndexCacheKey(port.h3Index);
            const existingPorts = await this.getPortsByH3Index(port.h3Index);
            const updatedPorts = existingPorts.filter(p => p.id !== port.id);
            updatedPorts.push(port);

            await this.cacheManager.set(h3Key, updatedPorts, this.H3_INDEX_CACHE_TTL);

            this.logger.debug(`Port cached: ${port.code} with H3 index: ${port.h3Index}`);
        } catch (error) {
            this.logger.error(`Error caching port ${port.id}:`, error);
        }
    }

    async getPort(portId: string): Promise<CachedPort | null> {
        try {
            const cacheKey = this.getPortCacheKey(portId);
            const cachedPort = await this.cacheManager.get<CachedPort>(cacheKey);

            if (cachedPort) {
                this.logger.debug(`Port found in cache: ${portId}`);
                return cachedPort;
            }

            return null;
        } catch (error) {
            this.logger.error(`Error getting port from cache ${portId}:`, error);
            return null;
        }
    }

    async getPortsByH3Index(h3Index: string): Promise<CachedPort[]> {
        try {
            const cacheKey = this.getH3IndexCacheKey(h3Index);
            const cachedPorts = await this.cacheManager.get<CachedPort[]>(cacheKey);

            if (cachedPorts) {
                this.logger.debug(`Found ${cachedPorts.length} ports in H3 index: ${h3Index}`);
                return cachedPorts.filter(port => port.isActive);
            }

            return [];
        } catch (error) {
            this.logger.error(`Error getting ports by H3 index ${h3Index}:`, error);
            return [];
        }
    }

    async cachePortsByH3Index(h3Index: string, ports: CachedPort[]): Promise<void> {
        try {
            const cacheKey = this.getH3IndexCacheKey(h3Index);
            await this.cacheManager.set(cacheKey, ports, this.H3_INDEX_CACHE_TTL);

            this.logger.debug(`Cached ${ports.length} ports for H3 index: ${h3Index}`);
        } catch (error) {
            this.logger.error(`Error caching ports for H3 index ${h3Index}:`, error);
        }
    }

    async getNearestPortFromCache(coordinate: Coordinate, radiusKm: number): Promise<NearestPortResult | null> {
        try {
            const cacheKey = this.getNearestPortCacheKey(coordinate, radiusKm);
            const cachedResult = await this.cacheManager.get<NearestPortResult>(cacheKey);

            if (cachedResult) {
                this.logger.debug(`Nearest port found in cache for coordinate: ${coordinate.toString()}`);
                return cachedResult;
            }

            return null;
        } catch (error) {
            this.logger.error(`Error getting nearest port from cache:`, error);
            return null;
        }
    }

    async cacheNearestPortResult(
        coordinate: Coordinate,
        result: NearestPortResult,
        radiusKm: number
    ): Promise<void> {
        try {
            const cacheKey = this.getNearestPortCacheKey(coordinate, radiusKm);
            await this.cacheManager.set(cacheKey, result, this.NEAREST_PORT_CACHE_TTL);

            this.logger.debug(`Cached nearest port result for coordinate: ${coordinate.toString()}`);
        } catch (error) {
            this.logger.error(`Error caching nearest port result:`, error);
        }
    }

    async invalidatePortCache(portId: string): Promise<void> {
        try {
            const cacheKey = this.getPortCacheKey(portId);
            await this.cacheManager.del(cacheKey);

            this.logger.debug(`Port cache invalidated: ${portId}`);
        } catch (error) {
            this.logger.error(`Error invalidating port cache ${portId}:`, error);
        }
    }

    async invalidateH3IndexCache(h3Index: string): Promise<void> {
        try {
            const cacheKey = this.getH3IndexCacheKey(h3Index);
            await this.cacheManager.del(cacheKey);

            this.logger.debug(`H3 index cache invalidated: ${h3Index}`);
        } catch (error) {
            this.logger.error(`Error invalidating H3 index cache ${h3Index}:`, error);
        }
    }

    async invalidateNearestPortCache(coordinate: Coordinate): Promise<void> {
        try {
            // Farklı radius değerleri için cache'leri temizle
            const radiusValues = [50, 100, 200, 500];

            for (const radius of radiusValues) {
                const cacheKey = this.getNearestPortCacheKey(coordinate, radius);
                await this.cacheManager.del(cacheKey);
            }

            this.logger.debug(`Nearest port cache invalidated for coordinate: ${coordinate.toString()}`);
        } catch (error) {
            this.logger.error(`Error invalidating nearest port cache:`, error);
        }
    }

    async clearAllCache(): Promise<void> {
        try {
            await this.cacheManager.reset();
            this.logger.debug('All cache cleared');
        } catch (error) {
            this.logger.error('Error clearing all cache:', error);
        }
    }

    async getCacheStats(): Promise<{
        portCacheSize: number;
        h3IndexCacheSize: number;
        nearestPortCacheSize: number;
    }> {
        // Redis cache için istatistikler
        // Bu basit bir implementasyon, gerçek projede Redis INFO komutu kullanılabilir
        return {
            portCacheSize: 0,
            h3IndexCacheSize: 0,
            nearestPortCacheSize: 0
        };
    }

    private getPortCacheKey(portId: string): string {
        return `port:${portId}`;
    }

    private getH3IndexCacheKey(h3Index: string): string {
        return `h3:${h3Index}:ports`;
    }

    private getNearestPortCacheKey(coordinate: Coordinate, radiusKm: number): string {
        // Koordinatları yuvarla (cache hit oranını artırmak için)
        const roundedLat = Math.round(coordinate.latitude * 1000) / 1000;
        const roundedLng = Math.round(coordinate.longitude * 1000) / 1000;
        return `nearest:${roundedLat}:${roundedLng}:${radiusKm}`;
    }
}
