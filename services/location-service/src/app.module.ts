import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { HttpModule } from '@nestjs/axios';

// Services
import { LocationDomainService } from './domain/services/location.domain-service';
import { LocationCalculationService } from './domain/services/location-calculation.service';
import { PortCacheService } from './domain/services/port-cache.service';

// Infrastructure
import { EventPublisher } from './infrastructure/messaging/event.publisher';
import { PortServiceClient } from './infrastructure/clients/port.client';
import { PortEventHandler } from './infrastructure/messaging/port.event-handler';

// Controllers
import { LocationController } from './application/controllers/location.controller';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env.local', '.env']
        }),
        HttpModule.register({ timeout: 15000 }),
        CacheModule.register({
            ttl: 3600, // 1 hour default TTL
            max: 1000, // Maximum number of items in cache
            isGlobal: true,
        }),
    ],
    controllers: [LocationController],
    providers: [
        // Domain Services
        LocationDomainService,
        LocationCalculationService,
        PortCacheService,

        // Infrastructure
        EventPublisher,
        PortServiceClient,
        PortEventHandler,
    ],
    exports: [
        LocationDomainService,
        LocationCalculationService,
        PortCacheService
    ]
})
export class AppModule { }
