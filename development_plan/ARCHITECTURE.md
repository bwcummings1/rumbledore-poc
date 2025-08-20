# Rumbledore System Architecture

## Overview
Rumbledore implements a sandboxed, multi-tenant architecture where each fantasy football league operates in complete isolation while sharing a common platform infrastructure. The system integrates ESPN Fantasy Football data, AI-driven content generation, and paper betting features through a modular, scalable design.

## Core Architecture Patterns

### 1. Sandboxed Multi-Tenancy
Each league exists in its own isolated environment:

```
Platform Level
├── Authentication & User Management
├── Platform-Wide Content
└── Cross-League Features

League Level (Sandboxed)
├── League Namespace (league_12345_2024)
├── Dedicated Data Storage
├── League-Specific AI Agents
├── Private Content Pipeline
└── Isolated Betting Pool
```

### 2. Data Flow Architecture

```
ESPN API → Cookie Auth → Data Ingestion → Transformation → PostgreSQL
                ↓                              ↓              ↓
            Validation                   Identity Resolution  Cache (Redis)
                                                              ↓
                                                        Materialized Views
                                                              ↓
                                                         API Layer
                                                              ↓
                                                     Next.js Frontend
```

### 3. AI Agent Architecture

```
League Context → Agent Orchestrator → Specialized Agents
                        ↓                    ↓
                  Memory Store          - Analyst Agent
                  (pgvector)           - Writer Agent
                        ↓              - Historian Agent
                Content Pipeline       - Chat Agent
                        ↓
                Review System → Publishing → Notifications
```

## Technology Stack

### Frontend Layer
- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript 5.x
- **Styling**: Tailwind CSS + shadcn/ui
- **State Management**: Zustand
- **Real-time**: WebSockets (Socket.io)
- **Charts**: Recharts
- **Animation**: Framer Motion

### API Layer
- **Runtime**: Node.js 20 LTS
- **API Routes**: Next.js API Routes
- **Validation**: Zod
- **Authentication**: JWT + Cookies
- **Rate Limiting**: Redis-based
- **Caching**: Redis + Next.js Cache

### Data Layer
- **Primary Database**: PostgreSQL 16
- **Vector Database**: pgvector extension
- **Cache**: Redis 7
- **Queue**: Bull (Redis-backed)
- **File Storage**: Local (dev) / S3 (production)

### External Services
- **ESPN API**: Unofficial v3 (Cookie-based)
- **AI Provider**: OpenAI GPT-4 (initially)
- **Odds Provider**: The Odds API
- **Email**: Resend/SendGrid
- **Monitoring**: Sentry
- **Analytics**: PostHog/Mixpanel

## Database Schema Design

### Core Schema Structure

```sql
-- Platform Level (Shared)
users
user_sessions
platform_articles
platform_settings

-- League Level (Sandboxed by league_id)
leagues
league_members
league_players
league_teams
league_matchups
league_transactions
league_historical_data
league_agent_memory
league_articles
league_bets
league_competitions
```

### Key Design Decisions

1. **UUID Primary Keys**: All tables use UUIDs for globally unique identifiers
2. **JSONB for Flexibility**: Settings and metadata stored as JSONB
3. **Vector Embeddings**: 1536-dimensional vectors for semantic search
4. **Row-Level Security**: PostgreSQL RLS for data isolation
5. **Soft Deletes**: Maintain data integrity with deleted_at timestamps

## API Design

### RESTful Endpoints

```
/api/auth/
  POST   /login
  POST   /logout
  POST   /refresh
  
/api/leagues/
  GET    /                     # User's leagues
  POST   /                     # Create league
  GET    /:leagueId            # League details
  PUT    /:leagueId            # Update league
  DELETE /:leagueId            # Archive league
  
/api/leagues/:leagueId/
  POST   /sync                 # Trigger ESPN sync
  GET    /players              # League players
  GET    /matchups             # Matchups
  GET    /standings            # Current standings
  GET    /history              # Historical data
  GET    /stats                # Calculated statistics
  
/api/ai/
  POST   /generate             # Generate content
  GET    /articles             # List articles
  POST   /chat                 # Chat with agent
  
/api/betting/
  GET    /odds                 # Current odds
  POST   /place                # Place bet
  GET    /competitions         # Active competitions
  GET    /leaderboard          # Rankings
```

### WebSocket Events

```javascript
// Real-time updates
socket.on('league:score_update', (data) => {})
socket.on('league:transaction', (data) => {})
socket.on('chat:message', (data) => {})
socket.on('betting:odds_update', (data) => {})
socket.on('content:new_article', (data) => {})
```

## Security Architecture

### Authentication & Authorization
- **Multi-factor**: Email + OTP optional
- **Session Management**: Secure, httpOnly cookies
- **Token Rotation**: JWT with refresh tokens
- **League Access**: Role-based (owner, admin, member)

### Data Protection
- **Encryption at Rest**: AES-256 for sensitive data
- **Encryption in Transit**: TLS 1.3
- **ESPN Cookies**: Encrypted storage
- **API Keys**: Environment variables only
- **PII Handling**: GDPR/CCPA compliant

### API Security
- **Rate Limiting**: Per-user and per-IP
- **CORS**: Strict origin validation
- **Input Validation**: Zod schemas
- **SQL Injection**: Parameterized queries
- **XSS Prevention**: Content Security Policy

## Performance Architecture

### Caching Strategy

```
Level 1: Browser Cache
  - Static assets (CDN)
  - Service Worker cache
  
Level 2: Application Cache
  - Next.js ISR/SSG
  - React Query cache
  
Level 3: Redis Cache
  - API responses (5min TTL)
  - Session data
  - Odds data (5min TTL)
  
Level 4: Database Cache
  - Materialized views
  - Query result cache
```

### Optimization Techniques
- **Code Splitting**: Dynamic imports
- **Image Optimization**: Next.js Image component
- **Bundle Size**: Tree shaking, minification
- **Database Indexes**: Strategic indexing
- **Connection Pooling**: PgBouncer
- **Background Jobs**: Queue processing

## Scalability Architecture

### Horizontal Scaling
```
Load Balancer
    ↓
Next.js Instances (N)
    ↓
Redis Cluster
    ↓
PostgreSQL (Primary + Read Replicas)
```

### Vertical Scaling Limits
- **Database**: 100GB data, 10K concurrent connections
- **Redis**: 16GB memory per instance
- **API**: 1000 req/s per instance
- **WebSockets**: 10K concurrent connections

## Deployment Architecture

### Development Environment
```yaml
docker-compose:
  - postgres:16-pgvector
  - redis:7-alpine
  - next-app:dev
```

### Production Environment
```
Vercel (Frontend)
  ↓
API Gateway
  ↓
Container Orchestration (ECS/K8s)
  ↓
Managed Services:
  - RDS PostgreSQL
  - ElastiCache Redis
  - S3 Storage
```

## Monitoring & Observability

### Metrics Collection
- **Application**: Custom metrics via OpenTelemetry
- **Database**: pg_stat_statements
- **Redis**: INFO command metrics
- **API**: Response times, error rates
- **Business**: User engagement, feature usage

### Logging Strategy
```
Error Level → Sentry
Warn Level → Application logs
Info Level → Structured logs (JSON)
Debug Level → Development only
```

### Health Checks
```javascript
/api/health
  - Database connectivity
  - Redis connectivity
  - ESPN API availability
  - AI service status
  - Odds API status
```

## AI Agent Architecture Detail

### Agent Types & Responsibilities

```
Base Agent
├── Memory Management (pgvector)
├── Context Awareness
├── Tool Usage
└── Response Generation

Specialized Agents
├── Analyst Agent
│   ├── Data interpretation
│   ├── Trend analysis
│   └── Statistical insights
├── Writer Agent
│   ├── Article generation
│   ├── Style consistency
│   └── SEO optimization
├── Historian Agent
│   ├── League history
│   ├── Context provision
│   └── Record tracking
└── Chat Agent
    ├── Conversation management
    ├── Question answering
    └── Personality traits
```

### Memory Architecture
```sql
league_agent_memory
├── short_term_memory (conversation context)
├── long_term_memory (league history)
├── episodic_memory (specific events)
└── semantic_memory (embeddings)
```

## Betting System Architecture

### Competition Hierarchy
```
Platform Competitions
├── Individual Cross-League
│   └── Global leaderboards
└── League vs League
    └── Team competitions

League Competitions (Sandboxed)
├── Weekly Competitions
│   ├── Reset every Tuesday
│   └── 1000 unit bankroll
└── Season Competitions
    ├── Cumulative tracking
    └── Achievement system
```

### Transaction Processing
```
Bet Placement → Validation → Odds Lock → Transaction Log
                    ↓            ↓            ↓
                Risk Check   Cache Update  Audit Trail
                    ↓            ↓            ↓
                Settlement → Payout → Leaderboard Update
```

## Error Handling Strategy

### Graceful Degradation
1. **ESPN API Failure**: Use cached data, notify user
2. **AI Service Down**: Queue for later, show placeholder
3. **Odds API Issue**: Disable betting temporarily
4. **Database Connection**: Read from cache, queue writes

### Recovery Mechanisms
- **Automatic Retry**: Exponential backoff
- **Circuit Breaker**: Prevent cascade failures
- **Fallback Services**: Alternative providers
- **Manual Intervention**: Admin tools for recovery

## Development Workflow

### Branch Strategy
```
main (production)
├── develop (staging)
│   ├── feature/sprint-N-feature-name
│   ├── bugfix/issue-description
│   └── hotfix/critical-fix
```

### Testing Strategy
```
Unit Tests (Jest)
├── Components (React Testing Library)
├── API Routes (Supertest)
├── Utilities (Jest)
└── Database (pg-mem)

Integration Tests
├── API Integration
├── Database Operations
└── External Services (mocked)

E2E Tests (Playwright)
├── User Flows
├── League Operations
└── Betting Scenarios
```

## Future Architecture Considerations

### Planned Enhancements
1. **GraphQL API**: Better data fetching
2. **Microservices**: Service separation
3. **Event Sourcing**: Audit and replay
4. **CQRS**: Read/write separation
5. **Federation**: Multi-region support

### Potential Integrations
- Yahoo Fantasy API
- Sleeper API
- NFL official data
- Advanced analytics providers
- Social media platforms

---

*This architecture document is a living document and will be updated as the system evolves.*