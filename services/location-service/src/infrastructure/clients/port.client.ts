import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, Observable } from 'rxjs';

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
}

