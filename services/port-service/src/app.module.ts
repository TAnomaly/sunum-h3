import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';

// Entities
import { PortEntity } from './infrastructure/persistence/entities/port.entity';
import { OutboxEventEntity } from './infrastructure/persistence/entities/outbox.entity';

// Repositories
import { PortRepository } from './infrastructure/persistence/repositories/port.repository';
import { OutboxRepository } from './infrastructure/persistence/repositories/outbox.repository';

// Services
import { PortDomainService } from './domain/services/port.domain-service';
import { H3Service } from './domain/services/h3.service';
import { OutboxService } from './domain/services/outbox.service';

// Infrastructure
import { EventPublisher } from './infrastructure/messaging/event.publisher';

// Controllers
import { PortController } from './application/controllers/port.controller';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env.local', '.env']
        }),
        ScheduleModule.forRoot(),
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                type: 'postgres',
                url: configService.get<string>('DATABASE_URL'),
                entities: [PortEntity, OutboxEventEntity],
                synchronize: false,
                logging: process.env.NODE_ENV === 'development',
                migrations: [
                    // dist path for compiled migrations
                    __dirname + '/infrastructure/persistence/migrations/*{.ts,.js}'
                ],
                migrationsRun: true,
                retryAttempts: 3,
                retryDelay: 3000,
            }),
            inject: [ConfigService],
        }),
        CacheModule.registerAsync({
            isGlobal: true,
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: async (configService: ConfigService) => ({
                store: await redisStore({
                    url: configService.get<string>('REDIS_URL'),
                }),
                ttl: 600, // 10 minutes default TTL (port service için hafif cache)
                max: 1000,
            }),
        }),
        TypeOrmModule.forFeature([PortEntity, OutboxEventEntity])
    ],
    controllers: [PortController],
    providers: [
        // Repositories
        PortRepository,
        OutboxRepository,

        // Domain Services
        PortDomainService,
        H3Service,
        OutboxService,

        // Infrastructure
        EventPublisher,
    ],
    exports: [
        PortRepository,
        PortDomainService,
        H3Service
    ]
})
export class AppModule { }
