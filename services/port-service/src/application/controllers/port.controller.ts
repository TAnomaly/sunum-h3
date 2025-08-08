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
    UseGuards,
    ValidationPipe,
    UsePipes
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import {
    CreatePortDto,
    UpdatePortDto,
    PortResponseDto,
    FindNearestPortDto,
    NearestPortResponseDto,
    Coordinate,
    PaginationOptions,
    DomainError
} from '@port-finder/shared';
import { PortDomainService } from '../../domain/services/port.domain-service';

@ApiTags('Ports')
@Controller('ports')
@UsePipes(new ValidationPipe({ transform: true }))
export class PortController {
    private readonly logger = new Logger(PortController.name);

    constructor(private readonly portDomainService: PortDomainService) { }

    @Post()
    @ApiOperation({ summary: 'Create a new port' })
    @ApiResponse({ status: 201, description: 'Port created successfully', type: PortResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    @ApiResponse({ status: 409, description: 'Port with same code already exists' })
    async createPort(@Body() createPortDto: CreatePortDto): Promise<PortResponseDto> {
        try {
            this.logger.debug(`Creating port: ${createPortDto.name}`);

            const coordinate = new Coordinate(
                createPortDto.coordinate.latitude,
                createPortDto.coordinate.longitude
            );

            const port = await this.portDomainService.createPort(
                createPortDto.name,
                createPortDto.code,
                createPortDto.country,
                coordinate
            );

            return this.mapToResponseDto(port);
        } catch (error) {
            this.logger.error(`Error creating port: ${error.message}`);

            if (error instanceof DomainError) {
                const status = error.code === 'PORT_CODE_EXISTS' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
                throw new HttpException(error.message, status);
            }

            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get port by ID' })
    @ApiParam({ name: 'id', description: 'Port ID' })
    @ApiResponse({ status: 200, description: 'Port found', type: PortResponseDto })
    @ApiResponse({ status: 404, description: 'Port not found' })
    async getPortById(@Param('id') id: string): Promise<PortResponseDto> {
        try {
            const port = await this.portDomainService.getPortById(id);
            return this.mapToResponseDto(port);
        } catch (error) {
            this.logger.error(`Error getting port by ID ${id}: ${error.message}`);

            if (error instanceof DomainError && error.code === 'PORT_NOT_FOUND') {
                throw new HttpException(error.message, HttpStatus.NOT_FOUND);
            }

            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Get('code/:code')
    @ApiOperation({ summary: 'Get port by code' })
    @ApiParam({ name: 'code', description: 'Port code' })
    @ApiResponse({ status: 200, description: 'Port found', type: PortResponseDto })
    @ApiResponse({ status: 404, description: 'Port not found' })
    async getPortByCode(@Param('code') code: string): Promise<PortResponseDto> {
        try {
            const port = await this.portDomainService.getPortByCode(code);
            return this.mapToResponseDto(port);
        } catch (error) {
            this.logger.error(`Error getting port by code ${code}: ${error.message}`);

            if (error instanceof DomainError && error.code === 'PORT_NOT_FOUND') {
                throw new HttpException(error.message, HttpStatus.NOT_FOUND);
            }

            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Put(':id')
    @ApiOperation({ summary: 'Update port' })
    @ApiParam({ name: 'id', description: 'Port ID' })
    @ApiResponse({ status: 200, description: 'Port updated successfully', type: PortResponseDto })
    @ApiResponse({ status: 404, description: 'Port not found' })
    @ApiResponse({ status: 400, description: 'Invalid input data' })
    async updatePort(
        @Param('id') id: string,
        @Body() updatePortDto: UpdatePortDto
    ): Promise<PortResponseDto> {
        try {
            this.logger.debug(`Updating port: ${id}`);

            const coordinate = updatePortDto.coordinate
                ? new Coordinate(updatePortDto.coordinate.latitude, updatePortDto.coordinate.longitude)
                : undefined;

            const port = await this.portDomainService.updatePort(
                id,
                updatePortDto.name,
                coordinate
            );

            return this.mapToResponseDto(port);
        } catch (error) {
            this.logger.error(`Error updating port ${id}: ${error.message}`);

            if (error instanceof DomainError) {
                const status = error.code === 'PORT_NOT_FOUND' ? HttpStatus.NOT_FOUND : HttpStatus.BAD_REQUEST;
                throw new HttpException(error.message, status);
            }

            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Delete port' })
    @ApiParam({ name: 'id', description: 'Port ID' })
    @ApiResponse({ status: 204, description: 'Port deleted successfully' })
    @ApiResponse({ status: 404, description: 'Port not found' })
    async deletePort(@Param('id') id: string): Promise<void> {
        try {
            await this.portDomainService.deletePort(id);
        } catch (error) {
            this.logger.error(`Error deleting port ${id}: ${error.message}`);

            if (error instanceof DomainError && error.code === 'PORT_NOT_FOUND') {
                throw new HttpException(error.message, HttpStatus.NOT_FOUND);
            }

            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('find-nearby')
    @ApiOperation({ summary: 'Find nearby ports' })
    @ApiResponse({ status: 200, description: 'Nearby ports found', type: [PortResponseDto] })
    @ApiResponse({ status: 400, description: 'Invalid coordinates' })
    async findNearbyPorts(@Body() findNearestDto: FindNearestPortDto): Promise<PortResponseDto[]> {
        try {
            const coordinate = new Coordinate(
                findNearestDto.coordinate.latitude,
                findNearestDto.coordinate.longitude
            );

            const radiusKm = findNearestDto.radiusKm || 100;
            const ports = await this.portDomainService.findNearbyPorts(coordinate, radiusKm);

            return ports.map(port => this.mapToResponseDto(port));
        } catch (error) {
            this.logger.error(`Error finding nearby ports: ${error.message}`);
            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    @Post('recalculate-h3')
    @ApiOperation({ summary: 'Recalculate H3 indexes for all ports' })
    @ApiResponse({ status: 200, description: 'H3 indexes recalculated successfully' })
    async recalculateH3Indexes(): Promise<{ message: string }> {
        try {
            await this.portDomainService.recalculateH3Indexes();
            return { message: 'H3 indexes recalculated successfully' };
        } catch (error) {
            this.logger.error(`Error recalculating H3 indexes: ${error.message}`);
            throw new HttpException('Internal server error', HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private mapToResponseDto(port: any): PortResponseDto {
        return {
            id: port.id,
            name: port.name,
            code: port.code,
            country: port.country,
            coordinate: {
                latitude: port.coordinate.latitude,
                longitude: port.coordinate.longitude
            },
            h3Index: port.h3Index,
            isActive: port.isActive,
            createdAt: port.createdAt,
            updatedAt: port.updatedAt
        };
    }
}
