import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { Coordinate } from '@port-finder/shared';
import { PortCacheService, CachedPort } from '../../domain/services/port-cache.service';
import { LocationCalculationService } from '../../domain/services/location-calculation.service';

@Injectable()
export class PortEventHandler {
    private readonly logger = new Logger(PortEventHandler.name);
    private connection: any;
    private channel: any;
    private readonly exchange = 'port-finder-events';

    constructor(
        private readonly configService: ConfigService,
        private readonly portCacheService: PortCacheService,
        private readonly locationCalculationService: LocationCalculationService
    ) { }

    async onModuleInit(): Promise<void> {
        await this.connect();
        if (this.channel) {
            await this.setupEventHandlers();
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.disconnect();
    }

    private async connect(): Promise<void> {
        try {
            const rabbitmqUrl = this.configService.get<string>('RABBITMQ_URL');
            this.connection = await amqp.connect(rabbitmqUrl);
            this.channel = await this.connection.createChannel();

            await this.channel.assertExchange(this.exchange, 'topic', { durable: true });

            this.logger.log('Connected to RabbitMQ for event handling');
        } catch (error) {
            this.logger.error('Failed to connect to RabbitMQ:', error);
            this.logger.warn('Service will continue without RabbitMQ event handling.');
            // Don't throw error to prevent service from crashing
        }
    }

    private async disconnect(): Promise<void> {
        try {
            if (this.channel) {
                await this.channel.close();
            }
            if (this.connection) {
                await this.connection.close();
            }
            this.logger.log('Disconnected from RabbitMQ');
        } catch (error) {
            this.logger.error('Error disconnecting from RabbitMQ:', error);
        }
    }

    private async setupEventHandlers(): Promise<void> {
        try {
            // Port Created Event Handler
            await this.setupPortCreatedHandler();

            // Port Updated Event Handler
            await this.setupPortUpdatedHandler();

            // Port H3 Index Updated Event Handler
            await this.setupPortH3UpdatedHandler();

            this.logger.log('Event handlers setup completed');
        } catch (error) {
            this.logger.error('Error setting up event handlers:', error);
        }
    }

    private async setupPortCreatedHandler(): Promise<void> {
        const queueName = 'location-service.port.created';

        await this.channel.assertQueue(queueName, { durable: true });
        await this.channel.bindQueue(queueName, this.exchange, 'port.created');

        await this.channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const event = JSON.parse(message.content.toString());
                    await this.handlePortCreated(event);
                    this.channel.ack(message);
                } catch (error) {
                    this.logger.error('Error handling port created event:', error);
                    this.channel.nack(message, false, false);
                }
            }
        });

        this.logger.debug('Port created event handler setup');
    }

    private async setupPortUpdatedHandler(): Promise<void> {
        const queueName = 'location-service.port.updated';

        await this.channel.assertQueue(queueName, { durable: true });
        await this.channel.bindQueue(queueName, this.exchange, 'port.updated');

        await this.channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const event = JSON.parse(message.content.toString());
                    await this.handlePortUpdated(event);
                    this.channel.ack(message);
                } catch (error) {
                    this.logger.error('Error handling port updated event:', error);
                    this.channel.nack(message, false, false);
                }
            }
        });

        this.logger.debug('Port updated event handler setup');
    }

    private async setupPortH3UpdatedHandler(): Promise<void> {
        const queueName = 'location-service.port.h3.updated';

        await this.channel.assertQueue(queueName, { durable: true });
        await this.channel.bindQueue(queueName, this.exchange, 'port.h3.updated');

        await this.channel.consume(queueName, async (message) => {
            if (message) {
                try {
                    const event = JSON.parse(message.content.toString());
                    await this.handlePortH3Updated(event);
                    this.channel.ack(message);
                } catch (error) {
                    this.logger.error('Error handling port H3 updated event:', error);
                    this.channel.nack(message, false, false);
                }
            }
        });

        this.logger.debug('Port H3 updated event handler setup');
    }

    private async handlePortCreated(event: any): Promise<void> {
        try {
            this.logger.debug(`Handling port created event: ${event.payload.id}`);

            const coordinate = new Coordinate(
                event.payload.coordinate.latitude,
                event.payload.coordinate.longitude
            );

            // H3 index hesapla
            const h3Index = this.locationCalculationService.coordinateToH3(coordinate);

            const cachedPort: CachedPort = {
                id: event.payload.id,
                name: event.payload.name,
                code: event.payload.code,
                country: event.payload.country,
                coordinate,
                h3Index,
                isActive: true
            };

            // Cache'e ekle
            await this.portCacheService.cachePort(cachedPort);

            this.logger.debug(`Port cached successfully: ${cachedPort.code}`);
        } catch (error) {
            this.logger.error(`Error handling port created event:`, error);
            throw error;
        }
    }

    private async handlePortUpdated(event: any): Promise<void> {
        try {
            this.logger.debug(`Handling port updated event: ${event.payload.id}`);

            const coordinate = new Coordinate(
                event.payload.coordinate.latitude,
                event.payload.coordinate.longitude
            );

            // Eski cache'i temizle
            await this.portCacheService.invalidatePortCache(event.payload.id);

            // H3 index hesapla
            const h3Index = this.locationCalculationService.coordinateToH3(coordinate);

            const cachedPort: CachedPort = {
                id: event.payload.id,
                name: event.payload.name,
                code: event.payload.code || '', // Code güncellenmiyor olabilir
                country: event.payload.country || '', // Country güncellenmiyor olabilir
                coordinate,
                h3Index,
                isActive: true
            };

            // Yeni bilgilerle cache'e ekle
            await this.portCacheService.cachePort(cachedPort);

            // Koordinat değiştiği için nearest port cache'lerini temizle
            await this.portCacheService.invalidateNearestPortCache(coordinate);

            this.logger.debug(`Port updated in cache: ${event.payload.id}`);
        } catch (error) {
            this.logger.error(`Error handling port updated event:`, error);
            throw error;
        }
    }

    private async handlePortH3Updated(event: any): Promise<void> {
        try {
            this.logger.debug(`Handling port H3 updated event: ${event.payload.id}`);

            // Eski H3 index cache'ini temizle
            const cachedPort = await this.portCacheService.getPort(event.payload.id);
            if (cachedPort && cachedPort.h3Index) {
                await this.portCacheService.invalidateH3IndexCache(cachedPort.h3Index);
            }

            // Yeni H3 index ile cache'i güncelle
            if (cachedPort) {
                const updatedPort: CachedPort = {
                    ...cachedPort,
                    h3Index: event.payload.h3Index
                };

                await this.portCacheService.cachePort(updatedPort);
            }

            this.logger.debug(`Port H3 index updated in cache: ${event.payload.id}`);
        } catch (error) {
            this.logger.error(`Error handling port H3 updated event:`, error);
            throw error;
        }
    }
}
