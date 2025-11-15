#!/bin/bash

# Rumbledore Project Setup Script
# This script initializes the development environment

set -e  # Exit on error

echo "🚀 Rumbledore Project Setup"
echo "=============================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Helper functions
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}ℹ${NC} $1"
}

# Check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

echo "Step 1: Checking prerequisites..."
echo "-----------------------------------"

# Check Node.js
if command_exists node; then
    NODE_VERSION=$(node --version)
    print_success "Node.js is installed: $NODE_VERSION"

    # Check if version is >= 20
    NODE_MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 20 ]; then
        print_error "Node.js version must be 20 or higher. Current: $NODE_VERSION"
        exit 1
    fi
else
    print_error "Node.js is not installed. Please install Node.js 20 or higher."
    exit 1
fi

# Check npm
if command_exists npm; then
    NPM_VERSION=$(npm --version)
    print_success "npm is installed: $NPM_VERSION"
else
    print_error "npm is not installed."
    exit 1
fi

# Check Docker
if command_exists docker; then
    DOCKER_VERSION=$(docker --version)
    print_success "Docker is installed: $DOCKER_VERSION"
else
    print_error "Docker is not installed. Please install Docker Desktop."
    print_info "Download from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check Docker Compose
if docker compose version >/dev/null 2>&1; then
    COMPOSE_VERSION=$(docker compose version)
    print_success "Docker Compose is available: $COMPOSE_VERSION"
elif command_exists docker-compose; then
    COMPOSE_VERSION=$(docker-compose --version)
    print_success "Docker Compose is available: $COMPOSE_VERSION"
    DOCKER_COMPOSE_CMD="docker-compose"
else
    print_error "Docker Compose is not available."
    exit 1
fi

# Set Docker Compose command
if [ -z "$DOCKER_COMPOSE_CMD" ]; then
    DOCKER_COMPOSE_CMD="docker compose"
fi

echo ""
echo "Step 2: Setting up environment file..."
echo "----------------------------------------"

if [ -f .env.local ]; then
    print_info ".env.local already exists. Skipping creation."
else
    if [ -f .env.example ]; then
        cp .env.example .env.local
        print_success "Created .env.local from .env.example"
    else
        print_error ".env.example not found. Creating default .env.local..."

        cat > .env.local << 'EOF'
# Database Configuration
DATABASE_URL="postgresql://rumbledore_dev:localdev123@localhost:5432/rumbledore"
DIRECT_DATABASE_URL="postgresql://rumbledore_dev:localdev123@localhost:5432/rumbledore"

# Redis Configuration
REDIS_URL="redis://localhost:6379"

# Security Keys
ENCRYPTION_MASTER_KEY="dev_encryption_key_32_chars_minimum_length_required!!"
JWT_SECRET="dev_jwt_secret_change_in_production_please_make_it_secure"

# Application Configuration
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
EOF
        print_success "Created default .env.local"
    fi

    print_info "⚠️  Remember to update security keys before deploying to production!"
fi

echo ""
echo "Step 3: Installing dependencies..."
echo "------------------------------------"

if npm install --legacy-peer-deps; then
    print_success "Dependencies installed successfully"
else
    print_error "Failed to install dependencies"
    exit 1
fi

echo ""
echo "Step 4: Starting Docker services..."
echo "-------------------------------------"

print_info "Starting PostgreSQL and Redis containers..."

if $DOCKER_COMPOSE_CMD up -d; then
    print_success "Docker services started"
else
    print_error "Failed to start Docker services"
    exit 1
fi

# Wait for services to be healthy
print_info "Waiting for services to be ready..."
sleep 10

# Check if PostgreSQL is ready
print_info "Checking PostgreSQL..."
for i in {1..30}; do
    if docker exec rumbledore-postgres pg_isready -U rumbledore_dev >/dev/null 2>&1; then
        print_success "PostgreSQL is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "PostgreSQL failed to start"
        exit 1
    fi
    sleep 1
done

# Check if Redis is ready
print_info "Checking Redis..."
for i in {1..30}; do
    if docker exec rumbledore-redis redis-cli ping >/dev/null 2>&1; then
        print_success "Redis is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Redis failed to start"
        exit 1
    fi
    sleep 1
done

echo ""
echo "Step 5: Setting up database..."
echo "--------------------------------"

# Generate Prisma client
print_info "Generating Prisma client..."
if npx prisma generate; then
    print_success "Prisma client generated"
else
    print_error "Failed to generate Prisma client"
    exit 1
fi

# Run migrations
print_info "Running database migrations..."
if npx prisma migrate dev --name initial_setup; then
    print_success "Database migrated successfully"
else
    print_error "Failed to run migrations"
    exit 1
fi

echo ""
echo "Step 6: Verifying setup..."
echo "----------------------------"

# Check TypeScript compilation
print_info "Checking TypeScript compilation..."
if npm run type-check 2>/dev/null; then
    print_success "TypeScript compiles successfully"
else
    print_info "TypeScript has some errors (non-critical)"
fi

echo ""
echo "=============================="
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo "=============================="
echo ""
echo "Next steps:"
echo "  1. Run 'npm run dev' to start the development server"
echo "  2. Visit http://localhost:3000 in your browser"
echo "  3. Check the QUICKSTART.md for more information"
echo ""
echo "Useful commands:"
echo "  npm run dev              - Start development server"
echo "  npm test                 - Run tests"
echo "  npm run docker:up        - Start Docker services"
echo "  npm run docker:down      - Stop Docker services"
echo "  npm run db:studio        - Open Prisma Studio"
echo ""
echo "For more information, see:"
echo "  - QUICKSTART.md"
echo "  - START_HERE.md"
echo "  - CLAUDE.md"
echo ""
