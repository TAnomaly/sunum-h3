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

-- Insert sample port data
INSERT INTO ports (name, code, country, latitude, longitude, h3_index) VALUES
    ('Port of Istanbul', 'TRIST', 'Turkey', 41.0082, 28.9784, ''),
    ('Port of Izmir', 'TRIZM', 'Turkey', 38.4237, 27.1428, ''),
    ('Port of Mersin', 'TRMER', 'Turkey', 36.8121, 34.6415, ''),
    ('Port of Hamburg', 'DEHAM', 'Germany', 53.5511, 9.9937, ''),
    ('Port of Rotterdam', 'NLRTM', 'Netherlands', 51.9244, 4.4777, ''),
    ('Port of Antwerp', 'BEANR', 'Belgium', 51.2194, 4.4025, ''),
    ('Port of Barcelona', 'ESBCN', 'Spain', 41.3851, 2.1734, ''),
    ('Port of Marseille', 'FRMRS', 'France', 43.2965, 5.3698, ''),
    ('Port of Piraeus', 'GRPIR', 'Greece', 37.9755, 23.6348, ''),
    ('Port of Genoa', 'ITGOA', 'Italy', 44.4056, 8.9463, ''),
    ('Port of Valencia', 'ESVLC', 'Spain', 39.4699, -0.3763, ''),
    ('Port of Le Havre', 'FRLEH', 'France', 49.4944, 0.1079, ''),
    ('Port of Algeciras', 'ESALG', 'Spain', 36.1408, -5.4526, ''),
    ('Port of Gioia Tauro', 'ITGIT', 'Italy', 38.4249, 15.8983, ''),
    ('Port of Constantza', 'ROCND', 'Romania', 44.1598, 28.6348, '')
ON CONFLICT (code) DO NOTHING;

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
