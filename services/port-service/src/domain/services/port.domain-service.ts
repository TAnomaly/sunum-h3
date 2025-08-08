import { Injectable } from '@nestjs/common';
import { Port, Coordinate, PortCreatedEvent, PortUpdatedEvent, PortH3IndexUpdatedEvent, DomainError } from '@port-finder/shared';
import { PortRepository } from '../../infrastructure/persistence/repositories/port.repository';
import { OutboxService } from './outbox.service';
import { H3Service } from './h3.service';

@Injectable()
export class PortDomainService {
    constructor(
        private readonly portRepository: PortRepository,
        private readonly outboxService: OutboxService,
        private readonly h3Service: H3Service
    ) { }

    async createPort(name: string, code: string, country: string, coordinate: Coordinate): Promise<Port> {
        // Check if port with same code already exists
        const existingPort = await this.portRepository.findByCode(code);
        if (existingPort) {
            throw new DomainError(`Port with code ${code} already exists`, 'PORT_CODE_EXISTS');
        }

        // Create new port
        const port = new Port({
            name,
            code,
            country,
            coordinate
        });

        // Calculate H3 index
        const h3Index = this.h3Service.coordinateToH3(coordinate);
        port.updateH3Index(h3Index);

        // Save port
        const savedPort = await this.portRepository.save(port);

        // Create domain event
        const event = new PortCreatedEvent(
            savedPort.id,
            savedPort.name,
            savedPort.code,
            savedPort.country,
            savedPort.coordinate
        );

        // Save event to outbox
        await this.outboxService.saveEvent(event);

        return savedPort;
    }

    async updatePort(id: string, name?: string, coordinate?: Coordinate): Promise<Port> {
        const port = await this.portRepository.findById(id);
        if (!port) {
            throw new DomainError(`Port with id ${id} not found`, 'PORT_NOT_FOUND');
        }

        let isUpdated = false;

        if (name && name !== port.name) {
            port.updateName(name);
            isUpdated = true;
        }

        if (coordinate && !coordinate.equals(port.coordinate)) {
            port.updateCoordinate(coordinate);

            // Recalculate H3 index
            const h3Index = this.h3Service.coordinateToH3(coordinate);
            port.updateH3Index(h3Index);

            isUpdated = true;
        }

        if (!isUpdated) {
            return port;
        }

        // Save updated port
        const savedPort = await this.portRepository.save(port);

        // Create domain events
        if (name || coordinate) {
            const updateEvent = new PortUpdatedEvent(
                savedPort.id,
                savedPort.name,
                savedPort.coordinate
            );
            await this.outboxService.saveEvent(updateEvent);
        }

        if (coordinate) {
            const h3Event = new PortH3IndexUpdatedEvent(
                savedPort.id,
                savedPort.h3Index
            );
            await this.outboxService.saveEvent(h3Event);
        }

        return savedPort;
    }

    async getPortById(id: string): Promise<Port> {
        const port = await this.portRepository.findById(id);
        if (!port) {
            throw new DomainError(`Port with id ${id} not found`, 'PORT_NOT_FOUND');
        }
        return port;
    }

    async getPortByCode(code: string): Promise<Port> {
        const port = await this.portRepository.findByCode(code);
        if (!port) {
            throw new DomainError(`Port with code ${code} not found`, 'PORT_NOT_FOUND');
        }
        return port;
    }

    async deletePort(id: string): Promise<void> {
        const port = await this.portRepository.findById(id);
        if (!port) {
            throw new DomainError(`Port with id ${id} not found`, 'PORT_NOT_FOUND');
        }

        port.deactivate();
        await this.portRepository.save(port);
    }

    async findNearbyPorts(coordinate: Coordinate, radiusKm: number): Promise<Port[]> {
        return this.portRepository.findNearbyPorts(coordinate, radiusKm);
    }

    async recalculateH3Indexes(): Promise<void> {
        // Bu method tüm portların H3 indexlerini yeniden hesaplar
        // Büyük veri setleri için batch processing yapılmalı
        const ports = await this.portRepository.findAll({ page: 1, limit: 1000 });

        for (const port of ports.data) {
            const h3Index = this.h3Service.coordinateToH3(port.coordinate);
            if (h3Index !== port.h3Index) {
                port.updateH3Index(h3Index);
                await this.portRepository.save(port);

                const event = new PortH3IndexUpdatedEvent(port.id, h3Index);
                await this.outboxService.saveEvent(event);
            }
        }
    }
}
