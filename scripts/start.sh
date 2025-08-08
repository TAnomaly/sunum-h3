#!/bin/bash

# Port Finder Microservices Startup Script

set -e

echo "🚀 Starting Port Finder Microservices..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_step() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed. Please install Docker Compose and try again."
    exit 1
fi

# Stop any existing containers
print_step "Stopping existing containers..."
docker-compose down > /dev/null 2>&1 || true

# Start infrastructure services first
print_step "Starting infrastructure services (PostgreSQL, Redis, RabbitMQ)..."
docker-compose up -d postgres redis rabbitmq

# Wait for services to be ready
print_step "Waiting for infrastructure services to be ready..."
sleep 15

# Check PostgreSQL
print_step "Checking PostgreSQL connection..."
until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    print_warning "Waiting for PostgreSQL..."
    sleep 2
done
print_success "PostgreSQL is ready!"

# Check Redis
print_step "Checking Redis connection..."
until docker-compose exec -T redis redis-cli ping > /dev/null 2>&1; do
    print_warning "Waiting for Redis..."
    sleep 2
done
print_success "Redis is ready!"

# Check RabbitMQ
print_step "Checking RabbitMQ connection..."
until docker-compose exec -T rabbitmq rabbitmqctl status > /dev/null 2>&1; do
    print_warning "Waiting for RabbitMQ..."
    sleep 2
done
print_success "RabbitMQ is ready!"

# Build and start application services
print_step "Building and starting application services..."
docker-compose up -d --build

# Wait for services to start
print_step "Waiting for application services to start..."
sleep 20

# Health checks
print_step "Performing health checks..."

# Check API Gateway
if curl -f -s http://localhost:3000/health > /dev/null; then
    print_success "API Gateway is healthy"
else
    print_warning "API Gateway health check failed"
fi

# Check Port Service
if curl -f -s http://localhost:3001/health > /dev/null; then
    print_success "Port Service is healthy"
else
    print_warning "Port Service health check failed"
fi

# Check Location Service
if curl -f -s http://localhost:3002/health > /dev/null; then
    print_success "Location Service is healthy"
else
    print_warning "Location Service health check failed"
fi

echo ""
echo "🎉 Port Finder Microservices are now running!"
echo ""
echo "📋 Service URLs:"
echo "  🌐 API Gateway:         http://localhost:3000"
echo "  📚 API Documentation:   http://localhost:3000/api/docs"
echo "  🏥 Health Check:        http://localhost:3000/health"
echo "  🚢 Port Service:        http://localhost:3001"
echo "  📍 Location Service:    http://localhost:3002"
echo "  🐰 RabbitMQ Management: http://localhost:15672 (admin/admin123)"
echo ""
echo "🔧 Useful commands:"
echo "  make logs         - View all logs"
echo "  make down         - Stop all services"
echo "  make health       - Check service health"
echo "  make status       - View service status"
echo ""
echo "📖 Check README.md for more information!"
echo ""

# Show running containers
print_step "Running containers:"
docker-compose ps
