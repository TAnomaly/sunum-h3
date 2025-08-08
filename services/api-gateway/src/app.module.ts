import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';

// Clients
import { PortClient } from './infrastructure/clients/port.client';
import { LocationClient } from './infrastructure/clients/location.client';

// Controllers
import { GatewayController } from './application/controllers/gateway.controller';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env.local', '.env']
        }),
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: async (configService: ConfigService) => ({
                timeout: 30000,
                maxRedirects: 5,
                retries: 3,
                retryDelay: 1000,
            }),
            inject: [ConfigService],
        }),
        ThrottlerModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => [
                {
                    name: 'short',
                    ttl: 1000, // 1 second
                    limit: 10, // 10 requests per second
                },
                {
                    name: 'medium',
                    ttl: 60000, // 1 minute
                    limit: 100, // 100 requests per minute
                },
                {
                    name: 'long',
                    ttl: 3600000, // 1 hour
                    limit: 1000, // 1000 requests per hour
                },
            ],
            inject: [ConfigService],
        }),
        CacheModule.register({
            ttl: 1800, // 30 minutes default TTL
            max: 1000, // Maximum number of items in cache
            isGlobal: true,
        }),
    ],
    controllers: [GatewayController],
    providers: [
        PortClient,
        LocationClient,
    ],
})
export class AppModule { }
