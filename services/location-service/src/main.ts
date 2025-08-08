import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const logger = new Logger('LocationService');

    const app = await NestFactory.create(AppModule);

    // Global validation pipe - temporarily disabled
    // app.useGlobalPipes(new ValidationPipe({
    //     transform: true,
    //     whitelist: false,
    //     forbidNonWhitelisted: false,
    //     skipMissingProperties: false,
    //     skipNullProperties: false,
    //     skipUndefinedProperties: false,
    // }));

    // CORS
    app.enableCors({
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });

    // Swagger documentation
    if (process.env.NODE_ENV === 'development') {
        const config = new DocumentBuilder()
            .setTitle('Location Service API')
            .setDescription('Location processing and nearest port finding microservice')
            .setVersion('1.0')
            .addTag('location')
            .build();

        const document = SwaggerModule.createDocument(app, config);
        SwaggerModule.setup('api/docs', app, document);
    }

    // Health check endpoint
    app.getHttpAdapter().get('/health', (req, res) => {
        res.status(200).json({
            status: 'ok',
            service: 'location-service',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });

    const port = process.env.PORT || 3002;
    await app.listen(port);

    logger.log(`Location Service is running on port ${port}`);
    if (process.env.NODE_ENV === 'development') {
        logger.log(`Swagger documentation available at http://localhost:${port}/api/docs`);
    }
}

bootstrap().catch(error => {
    console.error('Error starting Location Service:', error);
    process.exit(1);
});
