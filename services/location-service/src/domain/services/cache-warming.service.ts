import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Coordinate } from '@port-finder/shared';
import { PortServiceClient } from '../../infrastructure/clients/port.client';
import { PortCacheService, CachedPort } from './port-cache.service';
import { LocationCalculationService } from './location-calculation.service';

@Injectable()
export class CacheWarmingService implements OnModuleInit {
    private readonly logger = new Logger(CacheWarmingService.name);

    constructor(
        private readonly portServiceClient: PortServiceClient,
        private readonly portCacheService: PortCacheService,
        private readonly locationCalculationService: LocationCalculationService,
        private readonly configService: ConfigService
    ) { }

    async onModuleInit(): Promise<void> {
        const warmCacheOnStartup = this.configService.get<string>('WARM_CACHE_ON_STARTUP');
        if (warmCacheOnStartup === 'false') {
            this.logger.log('Cache warming disabled by configuration');
            return;
        }

        // Startup'ta cache warming'i biraz geciktir ki diğer servisler hazır olsun
        setTimeout(() => {
            this.warmupCache().catch(error => {
                this.logger.error('Error during cache warmup:', error);
            });
        }, 5000); // 5 saniye bekle
    }

    async warmupCache(): Promise<void> {
        try {
            this.logger.log('🔥 Starting cache warmup...');

            // İlk önce cache'i temizle (stale data'dan kurtul)
            await this.portCacheService.clearAllCache();
            this.logger.log('🧹 Cache cleared before warmup');

            // Port Service'den tüm portları al
            const ports = await this.getAllPortsFromService();

            if (!ports || ports.length === 0) {
                this.logger.warn('No ports found during cache warmup');
                return;
            }

            this.logger.log(`📊 Found ${ports.length} ports to cache`);

            // H3 gruplarına göre organize et
            const h3Groups: { [key: string]: CachedPort[] } = {};
            let cachedCount = 0;

            for (const port of ports) {
                try {
                    const coordinate = new Coordinate(
                        port.coordinate.latitude,
                        port.coordinate.longitude
                    );

                    // H3 index hesapla
                    const h3Index = this.locationCalculationService.coordinateToH3(coordinate);

                    const cachedPort: CachedPort = {
                        id: port.id,
                        name: port.name,
                        code: port.code,
                        country: port.country,
                        coordinate,
                        h3Index,
                        isActive: port.isActive
                    };

                    // Tekil port cache'le
                    await this.portCacheService.cachePort(cachedPort);

                    // H3 gruplarına ekle
                    if (!h3Groups[h3Index]) {
                        h3Groups[h3Index] = [];
                    }
                    h3Groups[h3Index].push(cachedPort);

                    cachedCount++;

                    if (cachedCount % 10 === 0) {
                        this.logger.debug(`Cached ${cachedCount}/${ports.length} ports...`);
                    }

                } catch (error) {
                    this.logger.error(`Error caching port ${port.code}:`, error);
                }
            }

            // H3 index cache'lerini doldur
            let h3CachedCount = 0;
            for (const [h3Index, groupPorts] of Object.entries(h3Groups)) {
                await this.portCacheService.cachePortsByH3Index(h3Index, groupPorts);
                h3CachedCount++;
            }

            this.logger.log(`✅ Cache warmup completed:`);
            this.logger.log(`   - ${cachedCount} individual ports cached`);
            this.logger.log(`   - ${h3CachedCount} H3 indexes populated`);
            this.logger.log(`   - Average ${(cachedCount / h3CachedCount).toFixed(1)} ports per H3 cell`);

        } catch (error) {
            this.logger.error('❌ Cache warmup failed:', error);
        }
    }

    private async getAllPortsFromService(): Promise<any[]> {
        try {
            // Port Service'den tüm aktif portları al
            // Bu endpoint'in var olduğunu varsayıyoruz, yoksa fallback kullan

            // Önce büyük bir radius ile nearby ports al
            const centerCoordinate = new Coordinate(40.0, 30.0); // Dünya ortası
            const nearbyPorts = await this.portServiceClient.findNearbyPorts({
                coordinate: {
                    latitude: centerCoordinate.latitude,
                    longitude: centerCoordinate.longitude
                },
                radiusKm: 20000 // 20,000 km (dünya çapı)
            });

            return nearbyPorts || [];

        } catch (error) {
            this.logger.error('Error fetching ports from service:', error);
            return [];
        }
    }

    async manualWarmup(): Promise<{ success: boolean; message: string; stats?: any }> {
        try {
            await this.warmupCache();
            return {
                success: true,
                message: 'Cache warmup completed successfully'
            };
        } catch (error) {
            this.logger.error('Manual cache warmup failed:', error);
            return {
                success: false,
                message: `Cache warmup failed: ${error.message}`
            };
        }
    }
}
