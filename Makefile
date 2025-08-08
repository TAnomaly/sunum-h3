# Port Finder Microservices Makefile

.PHONY: help install build dev up down logs clean test lint format

# Default target
help:
	@echo "Available commands:"
	@echo "  install     - Install all dependencies"
	@echo "  build       - Build all services"
	@echo "  dev         - Start development environment"
	@echo "  up          - Start all services with Docker Compose"
	@echo "  down        - Stop all services"
	@echo "  logs        - Show logs from all services"
	@echo "  clean       - Clean up Docker containers and volumes"
	@echo "  test        - Run tests for all services"
	@echo "  lint        - Run linting for all services"
	@echo "  format      - Format code for all services"
	@echo "  db-seed     - Seed database with sample data"
	@echo "  db-reset    - Reset database"

# Install dependencies
install:
	@echo "Installing dependencies..."
	cd libs/shared && npm install
	cd services/port-service && npm install
	cd services/location-service && npm install
	cd services/api-gateway && npm install
	npm install

# Build all services
build:
	@echo "Building shared library..."
	cd libs/shared && npm run build
	@echo "Building services..."
	cd services/port-service && npm run build
	cd services/location-service && npm run build
	cd services/api-gateway && npm run build

# Start development environment
dev:
	@echo "Starting development environment..."
	docker-compose up -d postgres redis rabbitmq
	@echo "Waiting for services to start..."
	sleep 10
	@echo "Starting microservices..."
	npm run dev:services

# Start all services with Docker
up:
	@echo "Starting all services with Docker Compose..."
	docker-compose up -d
	@echo "Services are starting up..."
	@echo "API Gateway: http://localhost:3000"
	@echo "API Documentation: http://localhost:3000/api/docs"
	@echo "RabbitMQ Management: http://localhost:15672 (admin/admin123)"

# Stop all services
down:
	@echo "Stopping all services..."
	docker-compose down

# Show logs
logs:
	docker-compose logs -f

# Show logs for specific service
logs-api:
	docker-compose logs -f api-gateway

logs-port:
	docker-compose logs -f port-service

logs-location:
	docker-compose logs -f location-service

logs-postgres:
	docker-compose logs -f postgres

logs-redis:
	docker-compose logs -f redis

logs-rabbitmq:
	docker-compose logs -f rabbitmq

# Clean up
clean:
	@echo "Cleaning up Docker containers and volumes..."
	docker-compose down -v
	docker system prune -f

# Reset and rebuild everything
reset: clean
	@echo "Rebuilding everything..."
	docker-compose build --no-cache
	make up

# Database operations
db-seed:
	@echo "Seeding database with sample data..."
	docker-compose exec postgres psql -U postgres -d port_finder -f /docker-entrypoint-initdb.d/001-create-database.sql

db-reset:
	@echo "Resetting database..."
	docker-compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS port_finder;"
	docker-compose exec postgres psql -U postgres -c "CREATE DATABASE port_finder;"
	make db-seed

# Development commands
install-shared:
	cd libs/shared && npm install && npm run build

install-port-service:
	cd services/port-service && npm install

install-location-service:
	cd services/location-service && npm install

install-api-gateway:
	cd services/api-gateway && npm install

# Build individual services
build-shared:
	cd libs/shared && npm run build

build-port-service:
	cd services/port-service && npm run build

build-location-service:
	cd services/location-service && npm run build

build-api-gateway:
	cd services/api-gateway && npm run build

# Start individual services in development mode
dev-port-service:
	cd services/port-service && npm run start:dev

dev-location-service:
	cd services/location-service && npm run start:dev

dev-api-gateway:
	cd services/api-gateway && npm run start:dev

# Test commands
test:
	@echo "Running tests for all services..."
	cd services/port-service && npm test
	cd services/location-service && npm test
	cd services/api-gateway && npm test

test-port-service:
	cd services/port-service && npm test

test-location-service:
	cd services/location-service && npm test

test-api-gateway:
	cd services/api-gateway && npm test

# Lint commands
lint:
	@echo "Running linting for all services..."
	cd libs/shared && npm run lint
	cd services/port-service && npm run lint
	cd services/location-service && npm run lint
	cd services/api-gateway && npm run lint

# Format commands
format:
	@echo "Formatting code for all services..."
	cd libs/shared && npm run format
	cd services/port-service && npm run format
	cd services/location-service && npm run format
	cd services/api-gateway && npm run format

# Health checks
health:
	@echo "Checking service health..."
	@curl -s http://localhost:3000/health || echo "API Gateway: DOWN"
	@curl -s http://localhost:3001/health || echo "Port Service: DOWN"
	@curl -s http://localhost:3002/health || echo "Location Service: DOWN"

# Monitoring
status:
	@echo "Service Status:"
	@docker-compose ps
