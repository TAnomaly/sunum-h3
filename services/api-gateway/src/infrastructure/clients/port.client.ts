import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
    CreatePortDto,
    UpdatePortDto,
    PortResponseDto,
    FindNearestPortDto,
    PaginationOptions,
    PaginatedResult
} from '@port-finder/shared';

@Injectable()
export class PortClient {
    private readonly logger = new Logger(PortClient.name);
    private readonly baseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {
        this.baseUrl = this.configService.get<string>('PORT_SERVICE_URL') || 'http://localhost:3001';
    }

    async createPort(createPortDto: CreatePortDto): Promise<PortResponseDto> {
        try {
            this.logger.debug(`Creating port: ${createPortDto.name}`);

            const response = await firstValueFrom(
                this.httpService.post<PortResponseDto>(`${this.baseUrl}/ports`, createPortDto)
            );

            return response.data;
        } catch (error) {
            this.handleError('createPort', error);
        }
    }

    async getPortById(id: string): Promise<PortResponseDto> {
        try {
            this.logger.debug(`Getting port by ID: ${id}`);

            const response = await firstValueFrom(
                this.httpService.get<PortResponseDto>(`${this.baseUrl}/ports/${id}`)
            );

            return response.data;
        } catch (error) {
            this.handleError('getPortById', error);
        }
    }

    async getPortByCode(code: string): Promise<PortResponseDto> {
        try {
            this.logger.debug(`Getting port by code: ${code}`);

            const response = await firstValueFrom(
                this.httpService.get<PortResponseDto>(`${this.baseUrl}/ports/code/${code}`)
            );

            return response.data;
        } catch (error) {
            this.handleError('getPortByCode', error);
        }
    }

    async updatePort(id: string, updatePortDto: UpdatePortDto): Promise<PortResponseDto> {
        try {
            this.logger.debug(`Updating port: ${id}`);

            const response = await firstValueFrom(
                this.httpService.put<PortResponseDto>(`${this.baseUrl}/ports/${id}`, updatePortDto)
            );

            return response.data;
        } catch (error) {
            this.handleError('updatePort', error);
        }
    }

    async deletePort(id: string): Promise<void> {
        try {
            this.logger.debug(`Deleting port: ${id}`);

            await firstValueFrom(
                this.httpService.delete(`${this.baseUrl}/ports/${id}`)
            );
        } catch (error) {
            this.handleError('deletePort', error);
        }
    }

    async findNearbyPorts(findNearestDto: FindNearestPortDto): Promise<PortResponseDto[]> {
        try {
            this.logger.debug(`Finding nearby ports`);

            const response = await firstValueFrom(
                this.httpService.post<PortResponseDto[]>(`${this.baseUrl}/ports/find-nearby`, findNearestDto)
            );

            return response.data;
        } catch (error) {
            this.handleError('findNearbyPorts', error);
        }
    }

    async recalculateH3Indexes(): Promise<{ message: string }> {
        try {
            this.logger.debug('Recalculating H3 indexes');

            const response = await firstValueFrom(
                this.httpService.post<{ message: string }>(`${this.baseUrl}/ports/recalculate-h3`)
            );

            return response.data;
        } catch (error) {
            this.handleError('recalculateH3Indexes', error);
        }
    }

    async healthCheck(): Promise<any> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}/health`)
            );

            return response.data;
        } catch (error) {
            this.logger.error('Port service health check failed:', error);
            throw new HttpException('Port service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    private handleError(operation: string, error: any): never {
        this.logger.error(`Error in ${operation}:`, error);

        if (error instanceof AxiosError) {
            const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = error.response?.data?.message || error.message || 'Port service error';

            throw new HttpException(message, status);
        }

        throw new HttpException('Port service error', HttpStatus.INTERNAL_SERVER_ERROR);
    }
}
