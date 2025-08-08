import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1700000000001 implements MigrationInterface {
    name = 'InitSchema1700000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS ports (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            name VARCHAR(255) NOT NULL,
            code VARCHAR(10) UNIQUE NOT NULL,
            country VARCHAR(100) NOT NULL,
            latitude DECIMAL(10,8) NOT NULL,
            longitude DECIMAL(11,8) NOT NULL,
            h3_index VARCHAR(20),
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ports_coordinates ON ports(latitude, longitude)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ports_h3_index ON ports(h3_index)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ports_code ON ports(code)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_ports_active ON ports(is_active)`);

        await queryRunner.query(`CREATE TABLE IF NOT EXISTS outbox_events (
            id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
            aggregate_id uuid NOT NULL,
            event_type VARCHAR(100) NOT NULL,
            event_data JSONB NOT NULL,
            status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            published_at TIMESTAMP,
            retry_count INTEGER DEFAULT 0,
            last_error TEXT
        )`);

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_outbox_aggregate_id ON outbox_events(aggregate_id)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_outbox_event_type ON outbox_events(event_type)`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status) WHERE status = 'PENDING'`);

        await queryRunner.query(`CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ language 'plpgsql';`);

        await queryRunner.query(`DROP TRIGGER IF EXISTS update_ports_updated_at ON ports`);
        await queryRunner.query(`CREATE TRIGGER update_ports_updated_at
            BEFORE UPDATE ON ports
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER IF EXISTS update_ports_updated_at ON ports`);
        await queryRunner.query(`DROP FUNCTION IF EXISTS update_updated_at_column`);
        await queryRunner.query(`DROP TABLE IF EXISTS outbox_events`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_outbox_pending`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_outbox_event_type`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_outbox_aggregate_id`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_outbox_status_created`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_ports_active`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_ports_code`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_ports_h3_index`);
        await queryRunner.query(`DROP INDEX IF EXISTS idx_ports_coordinates`);
        await queryRunner.query(`DROP TABLE IF EXISTS ports`);
    }
}


