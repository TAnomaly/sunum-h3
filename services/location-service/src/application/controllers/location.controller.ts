import {
    Controller,
    Post,
    Get,
    Body,
    Query,
    HttpStatus,
    HttpException,
    Logger,
    ValidationPipe,
    UsePipes
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import { IsNumber, IsOptional, ValidateNested, Min, Max, IsDefined } from 'class-validator';
import { Type } from 'class-transformer';
import {
    FindNearestPortDto,
    NearestPortResponseDto,
    CoordinateDto,
    Coordinate,
    DomainError
} from '@port-finder/shared';
import { LocationDomainService, NearestPortResult } from '../../domain/services/location.domain-service';
import { CacheWarmingService } from '../../domain/services/cache-warming.service';

export class LocationInfoDto {
    h3Index: string;
    h3Resolution: number;
    nearbyH3Cells: string[];
}

export class LocalCoordinateDto {
    @IsNumber({}, { message: 'Latitude must be a number' })
    @Min(-90, { message: 'Latitude must be between -90 and 90' })
    @Max(90, { message: 'Latitude must be between -90 and 90' })
    latitude: number;

    @IsNumber({}, { message: 'Longitude must be a number' })
    @Min(-180, { message: 'Longitude must be between -180 and 180' })
    @Max(180, { message: 'Longitude must be between -180 and 180' })
    longitude: number;
}

export class LocalFindNearestPortDto {
    @IsDefined({ message: 'coordinate is required' })
    @ValidateNested()
    @Type(() => LocalCoordinateDto)
    coordinate: LocalCoordinateDto;

    @IsOptional()
    @IsNumber({}, { message: 'Radius must be a number' })
    @Min(1, { message: 'Radius must be at least 1 km' })
    radiusKm?: number;
}

export class PortsInRadiusDto {
    @IsDefined({ message: 'coordinate is required' })
    @ValidateNested()
    @Type(() => LocalCoordinateDto)
    coordinate: LocalCoordinateDto;

    @IsNumber({}, { message: 'Radius must be a number' })
    @Min(1, { message: 'Radius must be at least 1 km' })
    radiusKm: number;
}

@ApiTags('Location')
@Controller('location')
@UsePipes(new ValidationPipe({ transform: true }))
export class LocationController {
    private readonly logger = new Logger(LocationController.name);

    constructor(
        private readonly locationDomainService: LocationDomainService,
        private readonly cacheWarmingService: CacheWarmingService
    ) { }

    @Post('nearest-port')
    @ApiOperation({ summary: 'Find nearest port to given coordinates' })
    @ApiResponse({ status: 200, description: 'Nearest port found', type: NearestPortResponseDto })
    @ApiResponse({ status: 404, description: 'No port found within radius' })
    @ApiResponse({ status: 400, description: 'Invalid coordinates' })
    @ApiBody({
        description: 'Coordinates',
        schema: {
            type: 'object',
            properties: {
                coordinate: {
                    type: 'object',
                    properties: {
                        latitude: { type: 'number', example: 20.0082001 },
                        longitude: { type: 'number', example: 28.9784 }
                    },
                    required: ['latitude', 'longitude']
                }
            },
            required: ['coordinate'],
            example: { coordinate: { latitude: 20.0082001, longitude: 28.9784 } }
        }
    })
    async findNearestPort(@Body() findNearestDto: LocalFindNearestPortDto): Promise<NearestPortResponseDto> {
        try {
            this.logger.debug(`Finding nearest port for coordinates: ${JSON.stringify(findNearestDto.coordinate)}`);

            const coordinate = new Coordinate(
                findNearestDto.coordinate.latitude,
                findNearestDto.coordinate.longitude
            );

            // Koordinat validasyonu
            const isValid = await this.locationDomainService.validateCoordinate(coordinate);
            if (!isValid) {
                throw new HttpException('Invalid coordinates', HttpStatus.BAD_REQUEST);
            }

            const maxRadius = typeof findNearestDto.radiusKm === 'number'
                ? findNearestDto.radiusKm
                : Number.POSITIVE_INFINITY;
            const nearestPort = await this.locationDomainService.findNearestPort(coordinate, maxRadius);

            if (!nearestPort) {
                throw new HttpException(
                    `No port found within ${maxRadius}km radius`,
                    HttpStatus.NOT_FOUND
                );
            }

            return this.mapToNearestPortResponse(nearestPort);
        } catch (error) {
            this.logger.error(`Error finding nearest port: ${error.message}`);

            if (error instanceof HttpException) {
                throw error;
            }

            if (error instanceof DomainError) {
                throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
            }

            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('ports-in-radius')
    @ApiOperation({ summary: 'Find all ports within specified radius' })
    @ApiResponse({ status: 200, description: 'Ports found within radius', type: [NearestPortResponseDto] })
    @ApiResponse({ status: 400, description: 'Invalid coordinates or radius' })
    @ApiBody({
        description: 'Coordinates and radius',
        schema: {
            type: 'object',
            properties: {
                coordinate: {
                    type: 'object',
                    properties: {
                        latitude: { type: 'number', example: 41.0255 },
                        longitude: { type: 'number', example: 28.9738 }
                    },
                    required: ['latitude', 'longitude']
                },
                radiusKm: { type: 'number', example: 50 }
            },
            required: ['coordinate', 'radiusKm']
        }
    })
    async findPortsInRadius(@Body() portsInRadiusDto: PortsInRadiusDto): Promise<NearestPortResponseDto[]> {
        try {
            this.logger.debug(`Finding ports in radius: ${portsInRadiusDto.radiusKm}km`);

            const coordinate = new Coordinate(
                portsInRadiusDto.coordinate.latitude,
                portsInRadiusDto.coordinate.longitude
            );

            // Koordinat validasyonu
            const isValid = await this.locationDomainService.validateCoordinate(coordinate);
            if (!isValid) {
                throw new HttpException('Invalid coordinates', HttpStatus.BAD_REQUEST);
            }

            if (portsInRadiusDto.radiusKm <= 0 || portsInRadiusDto.radiusKm > 1000) {
                throw new HttpException('Radius must be between 1 and 1000 km', HttpStatus.BAD_REQUEST);
            }

            const ports = await this.locationDomainService.findPortsInRadius(
                coordinate,
                portsInRadiusDto.radiusKm
            );

            return ports.map(port => this.mapToNearestPortResponse(port));
        } catch (error) {
            this.logger.error(`Error finding ports in radius: ${error.message}`);

            if (error instanceof HttpException) {
                throw error;
            }

            if (error instanceof DomainError) {
                throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
            }

            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('validate-coordinate')
    @ApiOperation({ summary: 'Validate coordinate format and range' })
    @ApiResponse({ status: 200, description: 'Coordinate validation result' })
    @ApiResponse({ status: 400, description: 'Invalid coordinate format' })
    @ApiBody({
        description: 'Coordinate to validate',
        schema: {
            type: 'object',
            properties: {
                latitude: { type: 'number', example: 41.0255 },
                longitude: { type: 'number', example: 28.9738 }
            },
            required: ['latitude', 'longitude']
        }
    })
    async validateCoordinate(@Body() coordinateDto: LocalCoordinateDto): Promise<{ isValid: boolean; message?: string }> {
        try {
            const coordinate = new Coordinate(coordinateDto.latitude, coordinateDto.longitude);
            const isValid = await this.locationDomainService.validateCoordinate(coordinate);

            return {
                isValid,
                message: isValid ? 'Coordinate is valid' : 'Coordinate is invalid'
            };
        } catch (error) {
            this.logger.error(`Error validating coordinate: ${error.message}`);
            return {
                isValid: false,
                message: 'Invalid coordinate format'
            };
        }
    }

    @Post('location-info')
    @ApiOperation({ summary: 'Get H3 location information for coordinates' })
    @ApiResponse({ status: 200, description: 'Location information', type: LocationInfoDto })
    @ApiResponse({ status: 400, description: 'Invalid coordinates' })
    @ApiBody({
        description: 'Coordinate',
        schema: {
            type: 'object',
            properties: {
                latitude: { type: 'number', example: 41.0255 },
                longitude: { type: 'number', example: 28.9738 }
            },
            required: ['latitude', 'longitude']
        }
    })
    async getLocationInfo(@Body() coordinateDto: LocalCoordinateDto): Promise<LocationInfoDto> {
        try {
            const coordinate = new Coordinate(coordinateDto.latitude, coordinateDto.longitude);

            // Koordinat validasyonu
            const isValid = await this.locationDomainService.validateCoordinate(coordinate);
            if (!isValid) {
                throw new HttpException('Invalid coordinates', HttpStatus.BAD_REQUEST);
            }

            const locationInfo = await this.locationDomainService.getLocationInfo(coordinate);
            return locationInfo;
        } catch (error) {
            this.logger.error(`Error getting location info: ${error.message}`);

            if (error instanceof HttpException) {
                throw error;
            }

            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('health')
    @ApiOperation({ summary: 'Health check endpoint' })
    @ApiResponse({ status: 200, description: 'Service health status' })
    async healthCheck(): Promise<{
        status: string;
        service: string;
        timestamp: string;
        uptime: number;
    }> {
        return {
            status: 'ok',
            service: 'location-service',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        };
    }

    @Post('test-nearest')
    @ApiOperation({ summary: 'Test nearest port without validation' })
    async testNearestPort(@Body() body: any): Promise<any> {
        try {
            this.logger.debug(`Test endpoint received: ${JSON.stringify(body)}`);

            // Hardcoded test with your coordinates
            const coordinate = new Coordinate(41.0255, 28.9738);
            const nearestPort = await this.locationDomainService.findNearestPort(coordinate, 50);

            if (!nearestPort) {
                return { message: 'No port found within 50km radius' };
            }

            return {
                success: true,
                port: {
                    name: nearestPort.name,
                    distance: nearestPort.distanceKm,
                    coordinates: {
                        latitude: nearestPort.coordinate.latitude,
                        longitude: nearestPort.coordinate.longitude
                    }
                }
            };
        } catch (error) {
            this.logger.error(`Test endpoint error: ${error.message}`);
            return { error: error.message };
        }
    }

    @Post('admin/warmup-cache')
    @ApiOperation({ summary: 'Manually trigger cache warmup (Admin only)' })
    @ApiResponse({ status: 200, description: 'Cache warmup completed' })
    @ApiResponse({ status: 500, description: 'Cache warmup failed' })
    async warmupCache(): Promise<{ success: boolean; message: string; stats?: any }> {
        try {
            this.logger.log('Manual cache warmup requested');
            const result = await this.cacheWarmingService.manualWarmup();

            if (result.success) {
                this.logger.log('Manual cache warmup completed successfully');
            } else {
                this.logger.error('Manual cache warmup failed');
            }

            return result;
        } catch (error) {
            this.logger.error(`Manual cache warmup error: ${error.message}`);
            return {
                success: false,
                message: `Cache warmup failed: ${error.message}`
            };
        }
    }

    private mapToNearestPortResponse(port: NearestPortResult): NearestPortResponseDto {
        return {
            port: {
                id: port.portId,
                name: port.name,
                code: port.code,
                country: port.country,
                coordinate: {
                    latitude: port.coordinate.latitude,
                    longitude: port.coordinate.longitude
                },
                h3Index: port.h3Index,
                isActive: true,
                createdAt: new Date(),
                updatedAt: new Date()
            },
            distanceKm: port.distanceKm,
            h3Distance: port.h3Distance
        };
    }
}
