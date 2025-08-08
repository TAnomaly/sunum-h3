import { DataSource } from 'typeorm';
import { PortEntity } from './infrastructure/persistence/entities/port.entity';
import { OutboxEventEntity } from './infrastructure/persistence/entities/outbox.entity';

export default new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    entities: [PortEntity, OutboxEventEntity],
    migrations: [__dirname + '/infrastructure/persistence/migrations/*{.ts,.js}'],
    synchronize: false,
    logging: process.env.NODE_ENV === 'development',
});


