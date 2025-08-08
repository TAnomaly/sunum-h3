import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
    FindNearestPortDto,
    NearestPortResponseDto,
    CoordinateDto
} from '@port-finder/shared';

export interface LocationInfoDto {
    h3Index: string;
    h3Resolution: number;
    nearbyH3Cells: string[];
}

export interface PortsInRadiusDto {
    coordinate: CoordinateDto;
    radiusKm: number;
}

@Injectable()
export class LocationClient {
    private readonly logger = new Logger(LocationClient.name);
    private readonly baseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {
        this.baseUrl = this.configService.get<string>('LOCATION_SERVICE_URL') || 'http://localhost:3002';
    }

    async findNearestPort(findNearestDto: FindNearestPortDto): Promise<NearestPortResponseDto> {
        try {
            this.logger.debug(`Finding nearest port via location service`);

            const response = await firstValueFrom(
                this.httpService.post<NearestPortResponseDto>(`${this.baseUrl}/location/nearest-port`, findNearestDto)
            );

            return response.data;
        } catch (error) {
            this.handleError('findNearestPort', error);
        }
    }

    async findPortsInRadius(portsInRadiusDto: PortsInRadiusDto): Promise<NearestPortResponseDto[]> {
        try {
            this.logger.debug(`Finding ports in radius via location service`);

            const response = await firstValueFrom(
                this.httpService.post<NearestPortResponseDto[]>(`${this.baseUrl}/location/ports-in-radius`, portsInRadiusDto)
            );

            return response.data;
        } catch (error) {
            this.handleError('findPortsInRadius', error);
        }
    }

    async validateCoordinate(coordinateDto: CoordinateDto): Promise<{ isValid: boolean; message?: string }> {
        try {
            this.logger.debug(`Validating coordinate via location service`);

            const response = await firstValueFrom(
                this.httpService.post<{ isValid: boolean; message?: string }>(`${this.baseUrl}/location/validate-coordinate`, coordinateDto)
            );

            return response.data;
        } catch (error) {
            this.handleError('validateCoordinate', error);
        }
    }

    async getLocationInfo(coordinateDto: CoordinateDto): Promise<LocationInfoDto> {
        try {
            this.logger.debug(`Getting location info via location service`);

            const response = await firstValueFrom(
                this.httpService.post<LocationInfoDto>(`${this.baseUrl}/location/location-info`, coordinateDto)
            );

            return response.data;
        } catch (error) {
            this.handleError('getLocationInfo', error);
        }
    }

    async healthCheck(): Promise<any> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}/health`)
            );

            return response.data;
        } catch (error) {
            this.logger.error('Location service health check failed:', error);
            throw new HttpException('Location service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private handleError(operation: string, error: any): never {
        this.logger.error(`Error in ${operation}:`, error);

        if (error instanceof AxiosError) {
            const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = error.response?.data?.message || error.message || 'Location service error';

            throw new HttpException(message, status);
        }

        throw new HttpException('Location service error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
