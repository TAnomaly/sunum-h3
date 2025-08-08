import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';

async function bootstrap() {
    const logger = new Logger('APIGateway');

    const app = await NestFactory.create(AppModule);

    // Security middleware
    app.use(helmet({
        contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
    }));

    // Compression middleware
    app.use(compression());

    // Global validation pipe (merkezi ayar)
    app.useGlobalPipes(new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: false,
        enableDebugMessages: process.env.NODE_ENV !== 'production',
        transformOptions: { enableImplicitConversion: true },
    }));

    // CORS
    app.enableCors({
        origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: true,
    });

    // No global prefix needed - handled by controller

    // Swagger documentation
    const config = new DocumentBuilder()
        .setTitle('Port Finder API')
        .setDescription('API Gateway for Port Finder microservices system')
        .setVersion('1.0')
        .addTag('ports', 'Port management operations')
        .addTag('location', 'Location and search operations')
        .addTag('admin', 'Administrative operations')
        .addServer(process.env.API_BASE_URL || 'http://localhost:3000', 'Development server')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
        customSiteTitle: 'Port Finder API Documentation',
        customfavIcon: '/favicon.ico',
        customCss: '.swagger-ui .topbar { display: none }',
    });

    // Global health check endpoint
    app.getHttpAdapter().get('/health', (req, res) => {
        res.status(200).json({
            status: 'ok',
            service: 'api-gateway',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        });
    });

    // Graceful shutdown
    process.on('SIGTERM', async () => {
        logger.log('SIGTERM received, shutting down gracefully');
        await app.close();
        process.exit(0);
    });

    process.on('SIGINT', async () => {
        logger.log('SIGINT received, shutting down gracefully');
        await app.close();
        process.exit(0);
    });

    const port = process.env.PORT || 3000;
    await app.listen(port);

    logger.log(`🚀 API Gateway is running on port ${port}`);
    logger.log(`📚 Swagger documentation available at http://localhost:${port}/api/docs`);
    logger.log(`🏥 Health check available at http://localhost:${port}/health`);
    logger.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap().catch(error => {
    console.error('❌ Error starting API Gateway:', error);
    process.exit(1);
});
