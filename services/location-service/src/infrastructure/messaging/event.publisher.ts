import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';
import { IEventPublisher } from '@port-finder/shared';

@Injectable()
export class EventPublisher implements IEventPublisher {
    private readonly logger = new Logger(EventPublisher.name);
    private connection: any;
    private channel: any;
    private readonly exchange = 'port-finder-events';

    constructor(private readonly configService: ConfigService) { }

    async onModuleInit(): Promise<void> {
        await this.connect();
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

            this.logger.log('Connected to RabbitMQ');
        } catch (error) {
            this.logger.error('Failed to connect to RabbitMQ:', error);
            this.logger.warn('Service will continue without RabbitMQ. Events will not be published.');
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

    async publish(event: any): Promise<void> {
        try {
            if (!this.channel) {
                await this.connect();
            }

            const routingKey = this.getRoutingKey(event.eventType);
            const message = Buffer.from(JSON.stringify(event));

            const published = this.channel.publish(
                this.exchange,
                routingKey,
                message,
                {
                    persistent: true,
                    timestamp: Date.now(),
                    messageId: event.id,
                    correlationId: event.aggregateId,
                    type: event.eventType
                }
            );

            if (!published) {
                throw new Error('Failed to publish message to RabbitMQ');
            }

            this.logger.debug(`Event published: ${event.eventType} with routing key: ${routingKey}`);
        } catch (error) {
            this.logger.error(`Failed to publish event ${event.eventType}:`, error);
            throw error;
        }
    }

    private getRoutingKey(eventType: string): string {
        switch (eventType) {
            case 'NearestPortRequested':
                return 'location.nearest.requested';
            case 'NearestPortFound':
                return 'location.nearest.found';
            case 'LocationProcessed':
                return 'location.processed';
            default:
                return 'location.unknown';
        }
    }
}
