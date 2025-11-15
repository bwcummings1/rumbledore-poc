# Rumbledore - Fantasy Football Intelligence Platform

A comprehensive fantasy football platform that integrates ESPN league data with AI-driven content generation and paper betting features, using a sandboxed architecture where each league operates in complete isolation.

## 🎯 Project Overview

Rumbledore provides:
- **ESPN League Integration**: Secure authentication and real-time data synchronization
- **Historical Data Import**: Import up to 10 years of league history
- **AI Content Generation**: League-specific AI agents with dedicated memory (coming in Phase 3)
- **Paper Betting System**: Fantasy-based betting with odds integration (coming in Phase 4)
- **Complete League Isolation**: Each league operates in its own sandbox with dedicated storage

## 📋 Prerequisites

Before you begin, ensure you have:

- **Node.js** 20.x or higher ([Download](https://nodejs.org/))
- **Docker Desktop** ([Download](https://www.docker.com/products/docker-desktop))
- **Git** ([Download](https://git-scm.com/))
- **8GB RAM** minimum (for Docker services)

## 🚀 Quick Start

### Automated Setup (Recommended)

Run the automated setup script:

```bash
# Make the script executable (first time only)
chmod +x scripts/setup.sh

# Run the setup
./scripts/setup.sh
```

The script will:
1. Check all prerequisites
2. Create `.env.local` from template
3. Install dependencies
4. Start Docker services (PostgreSQL + Redis)
5. Generate Prisma client
6. Run database migrations
7. Verify the setup

### Manual Setup

If you prefer manual setup:

```bash
# 1. Install dependencies
npm install --legacy-peer-deps

# 2. Create environment file
cp .env.example .env.local
# Edit .env.local with your configuration

# 3. Start Docker services
docker compose up -d

# 4. Wait for services to be ready (~30 seconds)
docker compose ps

# 5. Generate Prisma client
npx prisma generate

# 6. Run database migrations
npx prisma migrate dev

# 7. Start development server
npm run dev
```

## 📁 Project Structure

```
rumbledore/
├── app/                        # Next.js 15 App Router
│   ├── (auth)/                # Authentication routes
│   ├── (dashboard)/           # Main application UI
│   └── api/                   # API routes
│       ├── health/            # Health check endpoint
│       ├── espn/              # ESPN integration endpoints
│       ├── sync/              # Data synchronization endpoints
│       ├── import/            # Historical data import endpoints
│       └── leagues/           # League management endpoints
├── components/                # React components
│   ├── ui/                    # shadcn/ui components
│   ├── dashboard/             # Dashboard-specific components
│   ├── chat/                  # Chat system components
│   ├── admin/                 # Admin panel components
│   └── import/                # Import UI components
├── lib/                       # Core utilities and services
│   ├── api/                   # API handler utilities
│   ├── cache/                 # Redis caching layer
│   ├── crypto/                # Encryption services
│   ├── espn/                  # ESPN API client
│   ├── import/                # Historical data import
│   ├── queue/                 # Job queue system (Bull)
│   ├── storage/               # Storage optimization
│   ├── sync/                  # Data sync orchestration
│   ├── transform/             # Data transformation
│   ├── utils/                 # Utility functions
│   └── websocket/             # Real-time updates
├── prisma/                    # Database schema and migrations
│   ├── schema.prisma          # Prisma schema (18 tables)
│   └── seed.ts                # Seed data
├── scripts/                   # Development scripts
│   ├── setup.sh               # Automated setup script
│   ├── verify-setup.ts        # Environment verification
│   └── health-check.ts        # Health check script
├── __tests__/                 # Test files
├── development_plan/          # Sprint documentation
│   ├── README.md              # Master development plan
│   ├── ARCHITECTURE.md        # Architecture overview
│   ├── PRINCIPLES.md          # Design principles
│   └── phase_*/               # Phase-specific documentation
├── browser-extension/         # ESPN cookie capture extension
├── docker-compose.yml         # Docker services configuration
├── .env.local                 # Local environment variables (gitignored)
├── .env.example               # Environment template
├── QUICKSTART.md              # Quick reference guide
├── START_HERE.md              # Getting started guide
└── CLAUDE.md                  # AI assistant context

```

## 🛠️ Available Commands

### Development
```bash
npm run dev          # Start Next.js development server (http://localhost:3000)
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
npm run format       # Format code with Prettier
```

### Testing
```bash
npm test             # Run Jest tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Generate coverage report
npm run test:all     # Run all checks (types, lint, tests)
```

### Database
```bash
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run migrations
npm run db:push      # Push schema changes
npm run db:seed      # Seed database
npm run db:reset     # Reset database
npm run db:studio    # Open Prisma Studio
```

### Docker
```bash
npm run docker:up    # Start Docker services
npm run docker:down  # Stop Docker services
npm run docker:reset # Reset Docker environment
```

### Utilities
```bash
npm run health:check # Check system health
npm run verify:setup # Verify environment setup
npm run cache:clear  # Clear Redis cache
```

## 🔧 Configuration

### Environment Variables

The `.env.local` file contains all environment variables. Key variables:

```env
# Database
DATABASE_URL="postgresql://rumbledore_dev:localdev123@localhost:5432/rumbledore"

# Redis
REDIS_URL="redis://localhost:6379"

# Security (CHANGE IN PRODUCTION!)
ENCRYPTION_MASTER_KEY="your-32-character-key"
JWT_SECRET="your-jwt-secret"

# Application
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

⚠️ **Security Warning**: The default keys are for development only. Generate secure keys for production:

```bash
# Generate a secure encryption key
openssl rand -base64 32

# Generate a JWT secret
openssl rand -base64 64
```

## 📊 Current Project Status

### ✅ Completed (Phase 1)

- **Sprint 1**: Local Development Setup
  - Docker Compose configuration (PostgreSQL + Redis)
  - Prisma ORM with sandboxed league schema
  - Development seed data scripts

- **Sprint 2**: ESPN Authentication System
  - AES-256-GCM cookie encryption
  - Secure credential storage
  - Browser extension for cookie capture
  - Cookie validation and refresh

- **Sprint 3**: Data Ingestion Pipeline
  - ESPN API client with rate limiting
  - Bull queue system for background jobs
  - WebSocket real-time updates
  - Redis caching with compression
  - Data transformation layer

- **Sprint 4**: Historical Data Import
  - Multi-season import with resume capability
  - SHA256 hash-based deduplication
  - 70% storage compression
  - Data integrity checking
  - Incremental sync strategy

### 🚧 Next Steps (Phase 2)

- **Sprint 5**: Identity Resolution System
- **Sprint 6**: Statistics Engine
- **Sprint 7**: Admin Portal

See `/development_plan/README.md` for the complete roadmap.

## 🏗️ Architecture Highlights

### Sandboxed League Design
Each league operates in complete isolation:
- Dedicated namespace in database
- League-specific AI agent memory
- Private content generation pipelines
- No cross-league data access

### Security First
- ESPN cookies encrypted with AES-256-GCM
- No plaintext credentials in database
- HTTPS-only cookie transmission
- Secure browser extension messaging

### Performance Optimized
- Redis caching (30s-30min TTLs)
- Gzip compression (~70% reduction)
- Rate limiting (30 req/min to ESPN)
- Queue-based async processing
- WebSocket for real-time updates

## 🧪 Testing

Run tests with:

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

Current test coverage:
- API routes: Health check endpoint
- Encryption service: AES-256-GCM implementation
- ESPN client: API integration
- Data transformer: ESPN to DB transformation

## 🐛 Troubleshooting

### Docker won't start
```bash
docker compose down -v
docker system prune -a
docker compose up -d
```

### Database connection errors
```bash
# Check service status
docker compose ps

# View logs
docker compose logs postgres

# Verify DATABASE_URL in .env.local matches docker-compose.yml
```

### Prisma client errors
```bash
# Regenerate client
npx prisma generate

# Reset database
npm run db:reset

# Restart TS server in VS Code
# Cmd/Ctrl + Shift + P -> "TypeScript: Restart TS Server"
```

### TypeScript errors
```bash
# Generate Prisma types
npx prisma generate

# Check for errors
npm run type-check

# Restart TS server in your IDE
```

### ESPN cookie issues
1. Ensure cookies captured from `fantasy.espn.com`
2. Check cookie expiration in admin UI
3. Validate cookies against ESPN API
4. Re-capture if expired

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Quick reference guide
- **[START_HERE.md](./START_HERE.md)** - Detailed getting started guide
- **[CLAUDE.md](./CLAUDE.md)** - AI assistant context and project state
- **[development_plan/](./development_plan/)** - Complete sprint documentation
  - [README.md](./development_plan/README.md) - Master plan
  - [ARCHITECTURE.md](./development_plan/ARCHITECTURE.md) - System architecture
  - [PRINCIPLES.md](./development_plan/PRINCIPLES.md) - Design principles

## 🤝 Development Workflow

1. **Read**: Check `CLAUDE.md` for current project state
2. **Plan**: Review sprint documentation in `/development_plan/`
3. **Develop**: Make changes incrementally
4. **Test**: Run tests frequently (`npm test`)
5. **Validate**: Type-check and lint (`npm run test:all`)
6. **Commit**: Use descriptive commit messages
7. **Document**: Update `CLAUDE.md` after significant changes

## 🔐 Security Considerations

### Never Store in Code
- ESPN cookies (use encrypted DB storage)
- API keys (use environment variables)
- User passwords (use bcrypt hashing)
- Sensitive league data

### Always Implement
- Input validation (Zod schemas)
- SQL injection prevention (Prisma)
- XSS protection (React default)
- CSRF protection (Next.js)
- Rate limiting (Redis-based)

## 📝 Contributing

This is a private project. For development guidelines:

1. Follow the sprint workflow in `/development_plan/SPRINT_WORKFLOW.md`
2. Use the Todo list system for task tracking
3. Update `CLAUDE.md` after completing sprints
4. Write tests for new features
5. Maintain mobile responsiveness

## 📄 License

Private project - All rights reserved

## 🆘 Support

For issues or questions:
1. Check `/development_plan/TROUBLESHOOTING.md`
2. Review sprint documentation
3. Check `CLAUDE.md` for known issues
4. Review previous sprint summaries in `/development_plan/sprint_summaries/`

---

**Current Version**: 0.1.0
**Last Updated**: November 2025
**Status**: Phase 1 Complete - Ready for Phase 2
