import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum OutboxStatusEnum {
    PENDING = 'PENDING',
    PUBLISHED = 'PUBLISHED',
    FAILED = 'FAILED'
}

@Entity('outbox_events')
@Index(['status', 'created_at'])
@Index(['aggregate_id'])
export class OutboxEventEntity {
    @PrimaryColumn('uuid')
    id: string;

    @Column({ type: 'uuid' })
    aggregate_id: string;

    @Column({ type: 'varchar', length: 100 })
    event_type: string;

    @Column({ type: 'jsonb' })
    event_data: any;

    @Column({
        type: 'enum',
        enum: OutboxStatusEnum,
        default: OutboxStatusEnum.PENDING
    })
    status: OutboxStatusEnum;

    @CreateDateColumn()
    created_at: Date;

    @Column({ type: 'timestamp', nullable: true })
    published_at: Date;

    @Column({ type: 'int', default: 0 })
    retry_count: number;

    @Column({ type: 'text', nullable: true })
    last_error: string;
}
