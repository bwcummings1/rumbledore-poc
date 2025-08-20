# Sprint 1: Local Development Setup

## Sprint Overview
**Phase**: 1 - ESPN Foundation & Core Infrastructure  
**Sprint**: 1 of 4  
**Duration**: 2 weeks  
**Focus**: Establish complete local development environment with Docker, PostgreSQL, and core architecture  
**Risk Level**: Low (all local development)

## Objectives
1. Set up Docker Compose environment with all required services
2. Create initial PostgreSQL database schema with sandboxed architecture
3. Configure Next.js API route structure
4. Establish comprehensive TypeScript type definitions
5. Set up testing framework and development tooling

## Prerequisites
- Node.js 20 LTS installed
- Docker Desktop installed and running
- Git configured
- VS Code or preferred IDE
- Basic understanding of Next.js 15 App Router

## Technical Tasks

### Task 1: Docker Environment Setup (Day 1-2)

#### 1.1 Create Docker Compose Configuration
```yaml
# docker-compose.yml
version: '3.8'
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: rumbledore-postgres
    environment:
      POSTGRES_USER: rumbledore_dev
      POSTGRES_PASSWORD: localdev123
      POSTGRES_DB: rumbledore
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U rumbledore_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: rumbledore-redis
    command: redis-server --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

#### 1.2 Create Initialization Scripts
```sql
-- scripts/init.sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
```

#### 1.3 Environment Configuration
```env
# .env.local
DATABASE_URL=postgresql://rumbledore_dev:localdev123@localhost:5432/rumbledore
DIRECT_DATABASE_URL=postgresql://rumbledore_dev:localdev123@localhost:5432/rumbledore
REDIS_URL=redis://localhost:6379
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development
```

### Task 2: Database Schema Creation (Day 3-4)

#### 2.1 Core Schema Design
```sql
-- prisma/migrations/001_initial_schema.sql

-- Users and Authentication
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Leagues with sandboxed namespace
CREATE TABLE leagues (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    espn_league_id BIGINT UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    season INTEGER NOT NULL,
    sandbox_namespace VARCHAR(100) UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(espn_league_id, season)
);

-- League memberships
CREATE TABLE league_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    espn_team_id INTEGER,
    team_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'member',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, user_id),
    CHECK (role IN ('owner', 'admin', 'member'))
);

-- ESPN credentials (encrypted)
CREATE TABLE espn_credentials (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    encrypted_swid TEXT,
    encrypted_espn_s2 TEXT,
    expires_at TIMESTAMPTZ,
    last_validated TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, league_id)
);

-- League-scoped player data
CREATE TABLE league_players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
    espn_player_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    position VARCHAR(10),
    nfl_team VARCHAR(10),
    stats JSONB DEFAULT '{}',
    projections JSONB DEFAULT '{}',
    embeddings vector(1536),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(league_id, espn_player_id)
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_leagues_espn_id ON leagues(espn_league_id);
CREATE INDEX idx_league_members_user ON league_members(user_id);
CREATE INDEX idx_league_members_league ON league_members(league_id);
CREATE INDEX idx_league_players_league ON league_players(league_id);
CREATE INDEX idx_league_players_embeddings ON league_players USING ivfflat (embeddings vector_cosine_ops);

-- Enable Row Level Security
ALTER TABLE leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_players ENABLE ROW LEVEL SECURITY;
```

#### 2.2 Prisma Configuration
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
  extensions = [uuid_ossp(map: "uuid-ossp"), vector, pg_trgm, btree_gist]
}

model User {
  id           String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  email        String   @unique @db.VarChar(255)
  username     String   @unique @db.VarChar(100)
  displayName  String?  @map("display_name") @db.VarChar(255)
  avatarUrl    String?  @map("avatar_url")
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  
  leagues      LeagueMember[]
  credentials  EspnCredential[]
  
  @@map("users")
}

model League {
  id               String   @id @default(dbgenerated("uuid_generate_v4()")) @db.Uuid
  espnLeagueId     BigInt   @unique @map("espn_league_id")
  name             String   @db.VarChar(255)
  season           Int
  sandboxNamespace String   @unique @map("sandbox_namespace") @db.VarChar(100)
  settings         Json     @default("{}")
  createdBy        String?  @map("created_by") @db.Uuid
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")
  
  members      LeagueMember[]
  players      LeaguePlayer[]
  credentials  EspnCredential[]
  
  @@unique([espnLeagueId, season])
  @@map("leagues")
}
```

### Task 3: API Route Structure (Day 5-6)

#### 3.1 Create API Directory Structure
```
app/api/
├── auth/
│   ├── login/route.ts
│   ├── logout/route.ts
│   └── session/route.ts
├── leagues/
│   ├── route.ts              # GET (list), POST (create)
│   └── [leagueId]/
│       ├── route.ts          # GET, PUT, DELETE
│       ├── sync/route.ts     # POST - trigger ESPN sync
│       └── members/route.ts  # GET, POST
├── health/route.ts           # Health check endpoint
└── test/route.ts            # Development testing endpoint
```

#### 3.2 Base API Handler
```typescript
// lib/api/handler.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export interface ApiContext {
  params?: Record<string, string>;
  user?: { id: string; email: string };
}

export type ApiHandler<T = any> = (
  request: NextRequest,
  context: ApiContext
) => Promise<NextResponse<T>>;

export function createApiHandler<T>(
  handler: ApiHandler<T>
): ApiHandler<T> {
  return async (request, context) => {
    try {
      // Add common middleware here (auth, logging, etc.)
      return await handler(request, context);
    } catch (error) {
      console.error('API Error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error' },
        { status: 500 }
      );
    }
  };
}

export function validateRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): T {
  return schema.parse(data);
}
```

### Task 4: TypeScript Type Definitions (Day 7-8)

#### 4.1 Core Type Definitions
```typescript
// types/index.ts
export interface User {
  id: string;
  email: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface League {
  id: string;
  espnLeagueId: number;
  name: string;
  season: number;
  sandboxNamespace: string;
  settings: LeagueSettings;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface LeagueSettings {
  scoringType: 'standard' | 'ppr' | 'half-ppr';
  teamCount: number;
  playoffTeams: number;
  tradeDeadline?: Date;
  [key: string]: any;
}

export interface LeagueMember {
  id: string;
  leagueId: string;
  userId: string;
  espnTeamId?: number;
  teamName?: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
}

// types/espn.ts
export interface ESPNLeague {
  id: number;
  name: string;
  seasonId: number;
  settings: {
    scoringSettings: Record<string, number>;
    rosterSettings: Record<string, number>;
    scheduleSettings: {
      numberOfRegularSeasonMatchups: number;
      playoffTeamCount: number;
    };
  };
  teams: ESPNTeam[];
  schedule: ESPNMatchup[];
}

export interface ESPNTeam {
  id: number;
  name: string;
  abbrev: string;
  owners: string[];
  roster: {
    entries: ESPNRosterEntry[];
  };
}

export interface ESPNPlayer {
  id: number;
  fullName: string;
  proTeamId: number;
  defaultPositionId: number;
  stats: ESPNPlayerStats[];
}
```

### Task 5: Testing Framework Setup (Day 9-10)

#### 5.1 Jest Configuration
```javascript
// jest.config.js
const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: './',
});

const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  collectCoverageFrom: [
    'app/**/*.{js,jsx,ts,tsx}',
    'lib/**/*.{js,jsx,ts,tsx}',
    'components/**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    '!**/.next/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
};

module.exports = createJestConfig(customJestConfig);
```

#### 5.2 Testing Utilities
```typescript
// lib/test/utils.ts
import { render, RenderOptions } from '@testing-library/react';
import { ReactElement } from 'react';

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function renderWithProviders(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>
) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

// lib/test/db.ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

import prisma from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

beforeEach(() => {
  mockReset(prismaMock);
});

export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;
```

### Task 6: Development Scripts (Day 11-12)

#### 6.1 Package.json Scripts
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:push": "prisma db push",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:reset": "docker-compose down -v && docker-compose up -d"
  }
}
```

#### 6.2 Development Seed Data
```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

async function main() {
  // Create test user
  const user = await prisma.user.create({
    data: {
      email: 'test@rumbledore.local',
      username: 'testuser',
      displayName: 'Test User',
    },
  });

  // Create test league
  const league = await prisma.league.create({
    data: {
      espnLeagueId: BigInt(123456),
      name: 'Test League',
      season: 2024,
      sandboxNamespace: 'league_123456_2024',
      settings: {
        scoringType: 'ppr',
        teamCount: 12,
        playoffTeams: 6,
      },
      createdBy: user.id,
    },
  });

  // Add user to league
  await prisma.leagueMember.create({
    data: {
      leagueId: league.id,
      userId: user.id,
      espnTeamId: 1,
      teamName: 'Test Team',
      role: 'owner',
    },
  });

  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

## Validation Criteria

### Functionality Checklist
- [ ] Docker services start successfully
- [ ] Database migrations run without errors
- [ ] API routes respond correctly
- [ ] TypeScript compiles without errors
- [ ] Tests pass with >80% coverage

### Performance Checklist
- [ ] Docker containers use < 2GB RAM combined
- [ ] Database queries execute in < 50ms
- [ ] API routes respond in < 100ms
- [ ] Development build time < 30 seconds
- [ ] Hot reload time < 2 seconds

### Quality Checklist
- [ ] ESLint passes without warnings
- [ ] TypeScript strict mode enabled
- [ ] Prettier formatting applied
- [ ] Documentation complete
- [ ] Git hooks configured

## Common Issues & Solutions

### Issue: Docker containers won't start
**Solution**: 
```bash
# Reset Docker environment
docker-compose down -v
docker system prune -a
docker-compose up -d
```

### Issue: Database connection errors
**Solution**:
```bash
# Check if PostgreSQL is ready
docker-compose ps
docker-compose logs postgres
# Ensure DATABASE_URL is correct in .env.local
```

### Issue: TypeScript errors in IDE
**Solution**:
```bash
# Regenerate Prisma types
npm run db:generate
# Restart TypeScript server in VS Code
# Cmd+Shift+P -> "TypeScript: Restart TS Server"
```

## Testing Instructions

### Manual Testing Steps
1. Start Docker environment: `npm run docker:up`
2. Run database migrations: `npm run db:migrate`
3. Seed database: `npm run db:seed`
4. Start dev server: `npm run dev`
5. Visit http://localhost:3000
6. Check health endpoint: http://localhost:3000/api/health

### Automated Testing
```bash
# Run all tests
npm test

# Run specific test suite
npm test -- league

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## Deliverables

### Code Deliverables
- ✅ Docker Compose configuration
- ✅ Database schema and migrations
- ✅ Prisma configuration
- ✅ API route structure
- ✅ TypeScript type definitions
- ✅ Test configuration and utilities
- ✅ Development scripts

### Documentation Deliverables
- ✅ Setup instructions
- ✅ API documentation
- ✅ Database schema documentation
- ✅ Development workflow guide
- ✅ Troubleshooting guide

## Success Metrics
- All Docker services running: ✅
- Database accessible: ✅
- API routes responding: ✅
- TypeScript compiling: ✅
- Tests passing: ✅
- Documentation complete: ✅

## Handoff to Sprint 2

### What's Ready
- Complete development environment
- Database schema for ESPN data
- API structure for authentication
- Type definitions for ESPN integration
- Testing framework for validation

### What's Needed Next
- ESPN cookie encryption implementation
- Browser extension development
- Cookie validation logic
- Admin UI for credentials

### Key Files for Next Sprint
- `/lib/api/handler.ts` - Base API handler
- `/types/espn.ts` - ESPN type definitions
- `/prisma/schema.prisma` - Database schema
- `/.env.local` - Environment configuration

---

*Sprint 1 establishes the foundational infrastructure. Ensure all components are working correctly before proceeding to Sprint 2.*