import {
    Controller,
    Get,
    Post,
    Put,
    Delete,
    Body,
    Param,
    Query,
    HttpStatus,
    HttpException,
    Logger,
    ValidationPipe,
    UsePipes,
    UseGuards,
    UseInterceptors
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
    CreatePortDto,
    UpdatePortDto,
    PortResponseDto,
    FindNearestPortDto,
    NearestPortResponseDto,
    CoordinateDto
} from '@port-finder/shared';
import { PortClient } from '../../infrastructure/clients/port.client';
import { LocationClient, LocationInfoDto, PortsInRadiusDto } from '../../infrastructure/clients/location.client';

@ApiTags('Port Finder API')
@Controller('api/v1')
@UsePipes(new ValidationPipe({ transform: true }))
@UseGuards(ThrottlerGuard)
export class GatewayController {
    private readonly logger = new Logger(GatewayController.name);

    constructor(
        private readonly portClient: PortClient,
        private readonly locationClient: LocationClient
    ) { }

    // Port Management Endpoints
    @Post('ports')
    @ApiOperation({ summary: 'Create a new port' })
    @ApiResponse({ status: 201, description: 'Port created successfully', type: PortResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @ApiResponse({ status: 409, description: 'Port with same code already exists' })
    async createPort(@Body() createPortDto: CreatePortDto): Promise<PortResponseDto> {
        this.logger.debug(`API Gateway: Creating port ${createPortDto.name}`);
        return this.portClient.createPort(createPortDto);
    }

    @Get('ports/:id')
    @ApiOperation({ summary: 'Get port by ID' })
    @ApiParam({ name: 'id', description: 'Port ID' })
    @ApiResponse({ status: 200, description: 'Port found', type: PortResponseDto })
    @ApiResponse({ status: 404, description: 'Port not found' })

    async getPortById(@Param('id') id: string): Promise<PortResponseDto> {
        this.logger.debug(`API Gateway: Getting port by ID ${id}`);
        return this.portClient.getPortById(id);
    }

    @Get('ports/code/:code')
    @ApiOperation({ summary: 'Get port by code' })
    @ApiParam({ name: 'code', description: 'Port code' })
    @ApiResponse({ status: 200, description: 'Port found', type: PortResponseDto })
    @ApiResponse({ status: 404, description: 'Port not found' })

    async getPortByCode(@Param('code') code: string): Promise<PortResponseDto> {
        this.logger.debug(`API Gateway: Getting port by code ${code}`);
        return this.portClient.getPortByCode(code);
    }

    @Put('ports/:id')
    @ApiOperation({ summary: 'Update port' })
    @ApiParam({ name: 'id', description: 'Port ID' })
    @ApiResponse({ status: 200, description: 'Port updated successfully', type: PortResponseDto })
    @ApiResponse({ status: 404, description: 'Port not found' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async updatePort(
        @Param('id') id: string,
        @Body() updatePortDto: UpdatePortDto
    ): Promise<PortResponseDto> {
        this.logger.debug(`API Gateway: Updating port ${id}`);
        return this.portClient.updatePort(id, updatePortDto);
    }

    @Delete('ports/:id')
    @ApiOperation({ summary: 'Delete port' })
    @ApiParam({ name: 'id', description: 'Port ID' })
    @ApiResponse({ status: 204, description: 'Port deleted successfully' })
    @ApiResponse({ status: 404, description: 'Port not found' })
    async deletePort(@Param('id') id: string): Promise<void> {
        this.logger.debug(`API Gateway: Deleting port ${id}`);
        return this.portClient.deletePort(id);
    }

    // Location and Search Endpoints
    @Post('location/nearest-port')
    @ApiOperation({ summary: 'Find nearest port to given coordinates' })
    @ApiResponse({ status: 200, description: 'Nearest port found', type: NearestPortResponseDto })
    @ApiResponse({ status: 404, description: 'No port found within radius' })
    @ApiResponse({ status: 400, description: 'Invalid coordinates' })

    async findNearestPort(@Body() findNearestDto: FindNearestPortDto): Promise<NearestPortResponseDto> {
        this.logger.debug(`API Gateway: Finding nearest port for coordinates`);
        return this.locationClient.findNearestPort(findNearestDto);
    }

    @Post('location/ports-in-radius')
    @ApiOperation({ summary: 'Find all ports within specified radius' })
    @ApiResponse({ status: 200, description: 'Ports found within radius', type: [NearestPortResponseDto] })
    @ApiResponse({ status: 400, description: 'Invalid coordinates or radius' })

    async findPortsInRadius(@Body() portsInRadiusDto: PortsInRadiusDto): Promise<NearestPortResponseDto[]> {
        this.logger.debug(`API Gateway: Finding ports in radius`);
        return this.locationClient.findPortsInRadius(portsInRadiusDto);
    }

    @Post('ports/find-nearby')
    @ApiOperation({ summary: 'Find nearby ports (alternative endpoint)' })
    @ApiResponse({ status: 200, description: 'Nearby ports found', type: [PortResponseDto] })
    @ApiResponse({ status: 400, description: 'Invalid coordinates' })

    async findNearbyPorts(@Body() findNearestDto: FindNearestPortDto): Promise<PortResponseDto[]> {
        this.logger.debug(`API Gateway: Finding nearby ports via port service`);
        return this.portClient.findNearbyPorts(findNearestDto);
    }

    // Utility Endpoints
    @Post('location/validate-coordinate')
    @ApiOperation({ summary: 'Validate coordinate format and range' })
    @ApiResponse({ status: 200, description: 'Coordinate validation result' })
    @ApiResponse({ status: 400, description: 'Invalid coordinate format' })
    async validateCoordinate(@Body() coordinateDto: CoordinateDto): Promise<{ isValid: boolean; message?: string }> {
        this.logger.debug(`API Gateway: Validating coordinate`);
        return this.locationClient.validateCoordinate(coordinateDto);
    }

    @Post('location/info')
    @ApiOperation({ summary: 'Get H3 location information for coordinates' })
    @ApiResponse({ status: 200, description: 'Location information' })
    @ApiResponse({ status: 400, description: 'Invalid coordinates' })

    async getLocationInfo(@Body() coordinateDto: CoordinateDto): Promise<LocationInfoDto> {
        this.logger.debug(`API Gateway: Getting location info`);
        return this.locationClient.getLocationInfo(coordinateDto);
    }

    // Admin Endpoints
    @Post('admin/ports/recalculate-h3')
    @ApiOperation({ summary: 'Recalculate H3 indexes for all ports (Admin only)' })
    @ApiResponse({ status: 200, description: 'H3 indexes recalculated successfully' })
    async recalculateH3Indexes(): Promise<{ message: string }> {
        this.logger.debug(`API Gateway: Recalculating H3 indexes`);
        return this.portClient.recalculateH3Indexes();
    }

    // Health Check Endpoints
    @Get('health')
    @ApiOperation({ summary: 'API Gateway health check' })
    @ApiResponse({ status: 200, description: 'Health status' })
    async healthCheck(): Promise<{
        status: string;
        timestamp: string;
        services: {
            gateway: string;
            portService: string;
            locationService: string;
        };
    }> {
        this.logger.debug(`API Gateway: Health check`);

        const services = {
            gateway: 'ok',
            portService: 'unknown',
            locationService: 'unknown'
        };

        // Check port service
        try {
            await this.portClient.healthCheck();
            services.portService = 'ok';
        } catch (error) {
            services.portService = 'error';
        }

        // Check location service
        try {
            await this.locationClient.healthCheck();
            services.locationService = 'ok';
        } catch (error) {
            services.locationService = 'error';
        }

        const overallStatus = Object.values(services).every(status => status === 'ok') ? 'ok' : 'degraded';

        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            services
        };
    }

    @Get('health/detailed')
    @ApiOperation({ summary: 'Detailed health check with service information' })
    @ApiResponse({ status: 200, description: 'Detailed health status' })
    async detailedHealthCheck(): Promise<{
        status: string;
        timestamp: string;
        uptime: number;
        services: any;
    }> {
        this.logger.debug(`API Gateway: Detailed health check`);

        const services: any = {
            gateway: {
                status: 'ok',
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                version: process.version
            }
        };

        // Check services with detailed info
        try {
            services.portService = await this.portClient.healthCheck();
        } catch (error) {
            services.portService = { status: 'error', error: error.message };
        }

        try {
            services.locationService = await this.locationClient.healthCheck();
        } catch (error) {
            services.locationService = { status: 'error', error: error.message };
        }

        const overallStatus = services.portService.status === 'ok' && services.locationService.status === 'ok' ? 'ok' : 'degraded';

        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            services
        };
    }
}
