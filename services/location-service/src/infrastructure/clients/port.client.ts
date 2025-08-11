import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, Observable } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class PortServiceClient {
    private readonly logger = new Logger(PortServiceClient.name);
    private readonly baseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {
        this.baseUrl = this.configService.get<string>('PORT_SERVICE_URL') || 'http://port-service:3001';
    }

    async findNearbyPorts(payload: any): Promise<any[]> {
        try {
            const url = `${this.baseUrl}/ports/find-nearby`;
            this.logger.debug(`Calling Port Service: POST ${url}`);

            const response = await firstValueFrom(this.httpService.post<any[]>(url, payload));
            return (response as any).data || [];
        } catch (error: any) {
            this.logger.error(`PortServiceClient.findNearbyPorts error: ${error?.message}`);
            throw new HttpException('Port service error', HttpStatus.BAD_GATEWAY);
        }
    }

    async getPortById(id: string): Promise<any | null> {
        try {
            const url = `${this.baseUrl}/ports/${id}`;
            this.logger.debug(`Calling Port Service: GET ${url}`);
            const response = await firstValueFrom(this.httpService.get<any>(url));
            return (response as any).data || null;
        } catch (error: any) {
            const axiosErr = error as AxiosError;
            const status = (axiosErr.response as any)?.status;
            if (status === 404) {
                return null; // does not exist
            }
            this.logger.error(`PortServiceClient.getPortById error: ${error?.message}`);
            throw new HttpException('Port service error', HttpStatus.BAD_GATEWAY);
        }
    }
}

