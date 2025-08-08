import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Port, Coordinate, IRepository, PaginatedResult, PaginationOptions } from '@port-finder/shared';
import { PortEntity } from '../entities/port.entity';

@Injectable()
export class PortRepository implements IRepository<Port> {
    constructor(
        @InjectRepository(PortEntity)
        private readonly portRepository: Repository<PortEntity>
    ) { }

    async findById(id: string): Promise<Port | null> {
        const entity = await this.portRepository.findOne({ where: { id } });
        return entity ? this.toDomain(entity) : null;
    }

    async save(port: Port): Promise<Port> {
        const entity = this.toEntity(port);
        const savedEntity = await this.portRepository.save(entity);
        return this.toDomain(savedEntity);
    }

    async delete(id: string): Promise<void> {
        await this.portRepository.delete(id);
    }

    async findByCode(code: string): Promise<Port | null> {
        const entity = await this.portRepository.findOne({ where: { code } });
        return entity ? this.toDomain(entity) : null;
    }

    async findAll(options: PaginationOptions): Promise<PaginatedResult<Port>> {
        const [entities, total] = await this.portRepository.findAndCount({
            skip: (options.page - 1) * options.limit,
            take: options.limit,
            where: { is_active: true },
            order: { created_at: 'DESC' }
        });

        return {
            data: entities.map(entity => this.toDomain(entity)),
            total,
            page: options.page,
            limit: options.limit,
            totalPages: Math.ceil(total / options.limit)
        };
    }

    async findByH3Index(h3Index: string): Promise<Port[]> {
        const entities = await this.portRepository.find({
            where: { h3_index: h3Index, is_active: true }
        });
        return entities.map(entity => this.toDomain(entity));
    }

    async findNearbyPorts(coordinate: Coordinate, radiusKm: number = 100): Promise<Port[]> {
        // Bu SQL query'si PostgreSQL'in earthdistance extension'ını kullanır
        // Alternatif olarak PostGIS kullanılabilir
        const query = `
      SELECT * FROM ports 
      WHERE is_active = true 
      AND (
        6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians($2)) + 
          sin(radians($1)) * sin(radians(latitude))
        )
      ) <= $3
      ORDER BY (
        6371 * acos(
          cos(radians($1)) * cos(radians(latitude)) * 
          cos(radians(longitude) - radians($2)) + 
          sin(radians($1)) * sin(radians(latitude))
        )
      ) ASC
    `;

        const entities = await this.portRepository.query(query, [
            coordinate.latitude,
            coordinate.longitude,
            radiusKm
        ]);

        return entities.map(entity => this.toDomain(entity));
    }

    private toDomain(entity: PortEntity): Port {
        return new Port({
            id: entity.id,
            name: entity.name,
            code: entity.code,
            country: entity.country,
            coordinate: new Coordinate(Number(entity.latitude), Number(entity.longitude)),
            h3Index: entity.h3_index,
            isActive: entity.is_active,
            createdAt: entity.created_at,
            updatedAt: entity.updated_at
        });
    }

    private toEntity(port: Port): PortEntity {
        const entity = new PortEntity();
        entity.id = port.id;
        entity.name = port.name;
        entity.code = port.code;
        entity.country = port.country;
        entity.latitude = port.coordinate.latitude;
        entity.longitude = port.coordinate.longitude;
        entity.h3_index = port.h3Index;
        entity.is_active = port.isActive;
        entity.created_at = port.createdAt;
        entity.updated_at = port.updatedAt;
        return entity;
    }
}
