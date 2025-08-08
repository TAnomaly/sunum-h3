-- Database initialization script for Port Finder
-- This script will be executed when PostgreSQL container starts

-- Create databases if they don't exist
SELECT 'CREATE DATABASE port_finder'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'port_finder')\gexec

-- Connect to port_finder database
\c port_finder;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ports table
CREATE TABLE IF NOT EXISTS ports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    code VARCHAR(10) UNIQUE NOT NULL,
    country VARCHAR(100) NOT NULL,
    latitude DECIMAL(10,8) NOT NULL,
    longitude DECIMAL(11,8) NOT NULL,
    h3_index VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for ports table
CREATE INDEX IF NOT EXISTS idx_ports_coordinates ON ports(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_ports_h3_index ON ports(h3_index);
CREATE INDEX IF NOT EXISTS idx_ports_code ON ports(code);
CREATE INDEX IF NOT EXISTS idx_ports_active ON ports(is_active);
CREATE INDEX IF NOT EXISTS idx_ports_country ON ports(country);

-- Create outbox_events table
CREATE TABLE IF NOT EXISTS outbox_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PUBLISHED', 'FAILED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT
);

-- Create indexes for outbox_events table
CREATE INDEX IF NOT EXISTS idx_outbox_status_created ON outbox_events(status, created_at);
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate_id ON outbox_events(aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_event_type ON outbox_events(event_type);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status) WHERE status = 'PENDING';

-- NOTE: Otomatik örnek port ekleme kaldırıldı.
-- Prod/doğru kullanım için portlar API üzerinden oluşturulmalıdır.
-- Örnek seed için `init-db/002-seed-sample-ports.sql.example` dosyasına bakınız.

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for ports table
DROP TRIGGER IF EXISTS update_ports_updated_at ON ports;
CREATE TRIGGER update_ports_updated_at
    BEFORE UPDATE ON ports
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
