/**
 * 🎯 SUNUM İÇİN KOD BLOKLARI - PORT FINDER MICROSERVICES
 * ========================================================
 * 
 * H3 Hexagonal Indexing ile Nearest Port Search Sistemi
 * Microservices Architecture + Event-Driven + Redis Cache
 */

// ==========================================
// 📡 1. API GATEWAY - İSTEK DİNLEME
// ==========================================

/**
 * API Gateway Controller - Gelen istekleri dinler
 * services/api-gateway/src/application/controllers/gateway.controller.ts
 */
@Controller('api/v1')
export class GatewayController {
    constructor(
        private readonly locationClient: LocationClient,
        private readonly portClient: PortClient,
    ) { }

    @Post('location/nearest-port')
    async findNearestPort(@Body() dto: FindNearestPortDto) {
        // Location Service'e yönlendir
        return this.locationClient.findNearestPort(dto.coordinate);
    }

    @Post('ports')
    async createPort(@Body() dto: CreatePortDto) {
        // Port Service'e yönlendir
        return this.portClient.createPort(dto);
    }
}

// ==========================================
// 🧠 2. LOCATION SERVICE - CORE LOGIC
// ==========================================

/**
 * Location Domain Service - Ana iş mantığı
 * services/location-service/src/domain/services/location.domain-service.ts
 */
@Injectable()
export class LocationDomainService {

    async findNearestPort(coordinate: Coordinate, maxRadiusKm?: number): Promise<NearestPortResult> {

        // 🔍 1. CACHE'DEN KONTROL ET (Staleness Guard ile)
        if (!isH3Only) {
            const cachedResult = await this.portCacheService.getNearestPortFromCache(coordinate, maxRadiusKm);
            if (cachedResult) {
                // ⚠️ CRITICAL: Cached result staleness validation
                const exists = await this.portServiceClient.getPortById(cachedResult.portId);
                if (exists) {
                    return cachedResult; // ✅ Valid cache
                } else {
                    // 🗑️ Stale cache - invalidate
                    await this.portCacheService.invalidatePortCache(cachedResult.portId);
                    await this.portCacheService.invalidateNearestPortCache(coordinate);
                }
            }
        }

        // 🎯 2. H3 İLE NEAREST PORT SEARCH
        let nearestPort = await this.findNearestPortUsingH3(coordinate, maxRadiusKm);

        // 🔄 3. FALLBACK MECHANISM (H3 bulamazsa)
        if (!nearestPort && !isH3Only) {
            nearestPort = await this.findNearestViaPortService(coordinate, maxRadiusKm);
        }

        // 🛡️ 4. STALENESS GUARD (Final validation)
        if (nearestPort) {
            try {
                const exists = await this.portServiceClient.getPortById(nearestPort.portId);
                if (!exists) {
                    // Port DB'de yok - cache'i temizle ve tekrar ara
                    await this.portCacheService.invalidatePortCache(nearestPort.portId);
                    await this.portCacheService.invalidateNearestPortCache(coordinate);
                    return await this.findNearestPort(coordinate, maxRadiusKm); // Recursive call
                }
            } catch (e) {
                this.logger.warn(`Port validation failed: ${e.message}`);
            }
        }

        // 💾 5. CACHE'E KAYDET
        if (nearestPort) {
            await this.portCacheService.cacheNearestPort(coordinate, nearestPort, maxRadiusKm);
        }

        return nearestPort;
    }
}

// ==========================================
// 🔍 3. H3 K-RING SEARCH ALGORITHM
// ==========================================

/**
 * H3 K-Ring ile Nearest Port Search - Core Algorithm
 */
private async findNearestPortUsingH3(coordinate: Coordinate, maxRadiusKm: number): Promise < NearestPortResult | null > {

    // 1️⃣ H3 ile index hesaplayıp ring tabanlı search yapıyoruz
    const h3Index = this.locationCalculationService.coordinateToH3(coordinate);

    // 2️⃣ H3 ring ile komşu halkaları büyüterek ara
    let ports: any[] = [];
    let ring = 0;
    const maxRing = Number.isFinite(maxRadiusKm)
        ? this.locationCalculationService.calculateRequiredH3Rings(maxRadiusKm)
        : 10; // güvenli üst sınır

    // 3️⃣ Ring by ring genişlet, port bulunca dur
    while(ring <= maxRing && ports.length === 0) {
    const cells = this.locationCalculationService.getH3Neighbors(h3Index, ring);
    for (const cell of cells) {
        const cellPorts = await this.portCacheService.getPortsByH3Index(cell);
        if (cellPorts.length > 0) ports.push(...cellPorts);
    }
    ring++;
}

// 4️⃣ Mesafeleri hesapla ve en yakınını bul
let nearestPort: NearestPortResult | null = null;
let minDistance = Infinity;

for (const port of ports) {
    // 🔸 1. H3 Mesafesi: Grid tabanlı mesafe (kaç hücre uzakta)
    const h3Distance = this.locationCalculationService.calculateH3Distance(h3Index, port.h3Index);

    // 🔸 2. Gerçek Mesafe: Haversine formülü ile km cinsinden
    const distance = this.locationCalculationService.calculateDistance(coordinate, port.coordinate);

    // 🔸 3. HİBRİT SKOR: H3 + Haversine kombinasyonu
    const score = h3Distance * 1000 + distance;
    //             ↑ Öncelik H3'e    ↑ Tie-breaker Haversine

    // 🔸 4. En düşük skorlu port = En yakın port
    if (score < minDistance && (Number.isFinite(maxRadiusKm) ? distance <= maxRadiusKm : true)) {
        nearestPort = {
            portId: port.id,
            name: port.name,
            code: port.code,
            country: port.country,
            coordinate: port.coordinate,
            distanceKm: distance,        // ← Gerçek mesafe
            h3Distance,                  // ← H3 grid mesafesi  
            h3Index: port.h3Index
        };
        minDistance = score;
    }
}

return nearestPort;
}

// ==========================================
// 🗄️ 4. PORT SERVICE - VERİ YÖNETİMİ
// ==========================================

/**
 * Port Controller - Port CRUD operations
 * services/port-service/src/application/controllers/port.controller.ts
 */
@Controller('ports')
export class PortController {

    @Post()
    async createPort(@Body() dto: CreatePortDto) {
        // 1. Port oluştur
        const port = await this.portDomainService.createPort(dto);

        // 2. H3 index hesapla
        const h3Index = this.h3Service.coordinateToH3(dto.coordinate);
        await this.portDomainService.updatePortH3Index(port.id, h3Index);

        // 3. Event yayınla (RabbitMQ)
        await this.eventPublisher.publish('port.created', {
            portId: port.id,
            h3Index,
            coordinate: dto.coordinate
        });

        return port;
    }

    @Delete(':id')
    async deletePort(@Param('id') id: string) {
        const port = await this.portDomainService.getPortById(id);
        await this.portDomainService.deletePort(id);

        // Event yayınla
        await this.eventPublisher.publish('port.deleted', {
            portId: id,
            h3Index: port.h3Index
        });

        return { message: 'Port deleted successfully' };
    }
}

// ==========================================
// 📡 5. EVENT-DRIVEN ARCHITECTURE
// ==========================================

/**
 * Port Event Handler - RabbitMQ event dinleyici
 * services/location-service/src/infrastructure/messaging/port.event-handler.ts
 */
@Injectable()
export class PortEventHandler {

    @EventPattern('port.created')
    async handlePortCreated(data: PortCreatedEvent) {
        // Cache'e port ekle
        await this.portCacheService.cachePort(data.portId, data);

        // H3 index cache'ine ekle
        if (data.h3Index) {
            await this.portCacheService.addPortToH3Index(data.h3Index, data.portId);
        }

        this.logger.log(`✅ Port ${data.portId} cached successfully`);
    }

    @EventPattern('port.deleted')
    async handlePortDeleted(data: PortDeletedEvent) {
        // Cache'den port sil
        await this.portCacheService.invalidatePortCache(data.portId);

        // H3 index cache'inden sil
        if (data.h3Index) {
            await this.portCacheService.removePortFromH3Index(data.h3Index, data.portId);
        }

        this.logger.log(`🗑️ Port ${data.portId} removed from cache`);
    }

    @EventPattern('port.h3.updated')
    async handlePortH3Updated(data: PortH3UpdatedEvent) {
        // Eski H3'ten sil, yeni H3'e ekle
        if (data.oldH3Index) {
            await this.portCacheService.removePortFromH3Index(data.oldH3Index, data.portId);
        }

        await this.portCacheService.addPortToH3Index(data.newH3Index, data.portId);

        this.logger.log(`🔄 Port ${data.portId} H3 updated: ${data.oldH3Index} → ${data.newH3Index}`);
    }
}

// ==========================================
// 💾 6. REDIS CACHE SERVICE
// ==========================================

/**
 * Port Cache Service - Redis cache yönetimi
 * services/location-service/src/domain/services/port-cache.service.ts
 */
@Injectable()
export class PortCacheService {

    // Port cache
    async cachePort(portId: string, portData: any): Promise<void> {
        await this.redisClient.setex(`port:${portId}`, this.cacheTTL, JSON.stringify(portData));
    }

    // H3 index cache
    async addPortToH3Index(h3Index: string, portId: string): Promise<void> {
        await this.redisClient.sadd(`h3:index:${h3Index}:ports`, portId);
    }

    // Nearest port result cache
    async cacheNearestPort(coordinate: Coordinate, result: NearestPortResult, radius?: number): Promise<void> {
        const key = `nearest:${coordinate.latitude}:${coordinate.longitude}:${radius || 'inf'}`;
        await this.redisClient.setex(key, this.cacheTTL, JSON.stringify(result));
    }

    // Cache invalidation
    async invalidatePortCache(portId: string): Promise<void> {
        await this.redisClient.del(`port:${portId}`);
    }

    async invalidateH3IndexCache(h3Index: string): Promise<void> {
        await this.redisClient.del(`h3:index:${h3Index}:ports`);
    }

    async invalidateNearestPortCache(coordinate: Coordinate): Promise<void> {
        const pattern = `nearest:${coordinate.latitude}:${coordinate.longitude}:*`;
        const keys = await this.redisClient.keys(pattern);
        if (keys.length > 0) {
            await this.redisClient.del(...keys);
        }
    }
}

// ==========================================
// 🔧 7. H3 CALCULATION SERVICE
// ==========================================

/**
 * H3 Calculation Service - Geospatial calculations
 * services/location-service/src/domain/services/location-calculation.service.ts
 */
@Injectable()
export class LocationCalculationService {

    // Koordinat → H3 index
    coordinateToH3(coordinate: Coordinate): string {
        return h3.latLngToCell(coordinate.latitude, coordinate.longitude, this.h3Resolution);
    }

    // H3 komşu hücreleri (k-ring)
    getH3Neighbors(h3Index: string, ring: number): string[] {
        return h3.gridDisk(h3Index, ring);
    }

    // H3 mesafe hesaplama
    calculateH3Distance(h3Index1: string, h3Index2: string): number {
        return h3.gridDistance(h3Index1, h3Index2);
    }

    // Haversine mesafe hesaplama (km)
    calculateDistance(coord1: Coordinate, coord2: Coordinate): number {
        const R = 6371; // Earth radius in km
        const dLat = this.toRadians(coord2.latitude - coord1.latitude);
        const dLon = this.toRadians(coord2.longitude - coord1.longitude);

        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(coord1.latitude)) * Math.cos(this.toRadians(coord2.latitude)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Radius → H3 ring sayısı
    calculateRequiredH3Rings(radiusKm: number): number {
        const avgHexEdgeKm = h3.getHexagonEdgeLengthAvg(this.h3Resolution, h3.UNITS.km);
        return Math.ceil(radiusKm / avgHexEdgeKm);
    }
}

// ==========================================
// 🔄 8. CACHE WARMING SERVICE
// ==========================================

/**
 * Cache Warming Service - Startup'ta cache doldurma
 * services/location-service/src/domain/services/cache-warming.service.ts
 */
@Injectable()
export class CacheWarmingService implements OnModuleInit {

    async onModuleInit() {
        if (this.configService.get('WARM_CACHE_ON_STARTUP') === 'true') {
            setTimeout(() => this.warmupCache(), 5000); // 5 saniye bekle
        }
    }

    async warmupCache(): Promise<void> {
        this.logger.log('🔥 Starting cache warmup...');

        // Cache'i temizle
        await this.portCacheService.clearAllCache();

        // Tüm portları al
        const ports = await this.portServiceClient.getAllPorts();

        for (const port of ports) {
            // H3 index hesapla
            const h3Index = this.locationCalculationService.coordinateToH3(port.coordinate);

            // Cache'e ekle
            await this.portCacheService.cachePort(port.id, { ...port, h3Index });
            await this.portCacheService.addPortToH3Index(h3Index, port.id);
        }

        this.logger.log(`✅ Cache warmed up with ${ports.length} ports`);
    }
}

// ==========================================
// 🐳 9. DOCKER COMPOSE CONFIGURATION
// ==========================================

/**
 * docker-compose.yml - Microservices orchestration
 */
/*
services:
  # API Gateway
  api-gateway:
    build: ./services/api-gateway
    ports:
      - "3000:3000"
    environment:
      - LOCATION_SERVICE_URL=http://location-service:3002
      - PORT_SERVICE_URL=http://port-service:3001

  # Location Service
  location-service:
    build: ./services/location-service
    environment:
      - LOCATION_H3_ONLY=false           # Fallback enabled
      - WARM_CACHE_ON_STARTUP=true       # Auto cache warming
      - H3_RESOLUTION=7                  # H3 resolution level
      - REDIS_URL=redis://redis:6379
      - RABBITMQ_URL=amqp://rabbitmq:5672

  # Port Service
  port-service:
    build: ./services/port-service
    environment:
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/port_finder
      - RABBITMQ_URL=amqp://rabbitmq:5672

  # Infrastructure
  redis:
    image: redis:7-alpine
    # Non-persistent for development
    # volumes: - redis_data:/data (commented out)
    
  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=port_finder
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    
  rabbitmq:
    image: rabbitmq:3-management-alpine
    environment:
      - RABBITMQ_DEFAULT_USER=admin
      - RABBITMQ_DEFAULT_PASS=password
*/

// ==========================================
// 📊 10. SYSTEM ARCHITECTURE OVERVIEW
// ==========================================

/**
 * 🏗️ MICROSERVICES ARCHITECTURE
 * 
 * ┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
 * │ API Gateway │───▶│ Location Service │───▶│ Port Service│
 * └─────────────┘    └──────────────────┘    └─────────────┘
 *       │                       │                     │
 *       ▼                       ▼                     ▼
 * ┌─────────────┐    ┌──────────────────┐    ┌─────────────┐
 * │   Client    │    │   Redis Cache    │    │ PostgreSQL  │
 * └─────────────┘    └──────────────────┘    └─────────────┘
 *                             │
 *                             ▼
 *                    ┌──────────────────┐
 *                    │    RabbitMQ      │
 *                    └──────────────────┘
 * 
 * 🔍 SEARCH FLOW:
 * 1. Client → API Gateway
 * 2. API Gateway → Location Service
 * 3. Location Service → Redis Cache (check)
 * 4. If cache miss → H3 K-Ring Search
 * 5. If H3 fails → Fallback to Port Service
 * 6. Result → Cache → Client
 * 
 * 📡 EVENT FLOW:
 * 1. Port CRUD → Port Service
 * 2. Port Service → RabbitMQ Event
 * 3. Location Service → Event Handler
 * 4. Event Handler → Redis Cache Update
 * 
 * 🛡️ STALENESS GUARD:
 * 1. Cache result found
 * 2. Validate against Port Service
 * 3. If stale → Invalidate cache
 * 4. Re-run search with fresh data
 */

export default {
    message: "🎯 Sunum için hazır kod blokları!",
    features: [
        "✅ API Gateway routing",
        "✅ H3 K-Ring search algorithm",
        "✅ Event-driven cache management",
        "✅ Staleness guard implementation",
        "✅ Cache warming service",
        "✅ Microservices orchestration"
    ]
};
