# CLAUDE.md - AI Assistant Guidelines for Rumbledore Development

## Project Context
You are working on **Rumbledore**, a comprehensive fantasy football platform that integrates ESPN league data with AI-driven content generation and paper betting features. The platform uses a sandboxed architecture where each league operates in complete isolation with dedicated storage, AI agents, and content pipelines.

## Current Project Status

### ✅ Completed Work
- **Phase 0**: UI/UX Foundation (Dark theme, responsive design, chat system)
- **Development Planning**: All 16 sprint documentation complete with implementation guides

### 📚 Sprint Documentation Status
- **Phase 1**: ESPN Foundation & Core Infrastructure (Sprints 1-4) ✅ Documented
  - [ ] Sprint 1: Local Development Setup - Ready to implement
  - [ ] Sprint 2: ESPN Authentication - Ready to implement
  - [ ] Sprint 3: Data Ingestion Pipeline - Ready to implement
  - [ ] Sprint 4: Historical Data Import - Ready to implement
- **Phase 2**: League Intelligence & Analytics (Sprints 5-7) ✅ Documented
  - [ ] Sprint 5: Identity Resolution - Ready to implement
  - [ ] Sprint 6: Statistics Engine - Ready to implement
  - [ ] Sprint 7: Admin Portal - Ready to implement
- **Phase 3**: AI Content & Agent Architecture (Sprints 8-11) ✅ Documented
  - [ ] Sprint 8: Agent Foundation - Ready to implement
  - [ ] Sprint 9: League Agents - Ready to implement
  - [ ] Sprint 10: Content Pipeline - Ready to implement
  - [ ] Sprint 11: Chat Integration - Ready to implement
- **Phase 4**: Paper Betting System (Sprints 12-14) ✅ Documented
  - [ ] Sprint 12: Odds Integration - Ready to implement
  - [ ] Sprint 13: Betting Engine - Ready to implement
  - [ ] Sprint 14: Competitions - Ready to implement
- **Phase 5**: Production & Scale (Sprints 15-16) ✅ Documented
  - [ ] Sprint 15: Optimization - Ready to implement
  - [ ] Sprint 16: Deployment - Ready to implement

## Core Architecture Principles

### 1. Sandboxed League Design
- Each league has complete data isolation
- League-specific AI agents with dedicated memory
- Private content generation pipelines
- No cross-league data access without explicit permission

### 2. Development Approach
- **Local-First**: Everything testable without external services
- **Mobile-Desktop Parity**: Equal functionality across all devices
- **Data Integrity**: 100% accuracy for league statistics
- **AI Authenticity**: Content that feels genuine to each league
- **Security by Default**: Encrypted sensitive data, secure APIs

## Technical Stack

### Frontend
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui (New York variant)
- Zustand (state management)
- Framer Motion (animations)
- Recharts (data visualization)

### Backend
- Node.js 20 LTS
- PostgreSQL 16 with pgvector
- Redis 7 (caching)
- Prisma ORM
- OpenAI API (content generation)
- The Odds API (betting data)

### Development Environment
- Docker Compose
- Local PostgreSQL with pgvector
- Local Redis
- Jest (testing)
- ESLint + Prettier

## Project Structure

```
rumbledore/
├── app/                        # Next.js 15 App Router
│   ├── (auth)/                # Authentication routes
│   ├── (dashboard)/           # Main application
│   └── api/                   # API routes
├── components/                # React components
│   ├── dashboard/            # Dashboard UI
│   ├── chat/                # Chat system
│   └── ui/                  # shadcn/ui components
├── lib/                      # Core utilities
│   ├── espn/                # ESPN integration
│   ├── ai/                  # AI agents
│   ├── betting/             # Betting system
│   └── crypto/              # Encryption utilities
├── types/                    # TypeScript definitions
├── prisma/                   # Database schema
├── development_plan/         # Sprint documentation
│   ├── README.md            # Master plan
│   ├── INTRODUCTION_PROMPT.md
│   ├── SUMMARY_PROMPT.md
│   ├── ARCHITECTURE.md
│   ├── PRINCIPLES.md
│   └── phase_*/             # Phase-specific docs
└── browser-extension/        # ESPN cookie capture

```

## Development Workflow

### Starting a Sprint
1. **FIRST: Read this CLAUDE.md file** to understand current project state
2. Read the sprint documentation at `/development_plan/phase_X/sprint_N.md`
3. Use the INTRODUCTION_PROMPT.md template for context
4. Conduct gap analysis (current state vs. target state)
4. Use TodoWrite tool to plan tasks
5. Implement incrementally with continuous testing

### During Development
1. **Always test locally first** before external integrations
2. **Maintain mobile responsiveness** for every feature
3. **Ensure league isolation** in all data operations
4. **Write tests alongside code** (target >90% coverage)
5. **Document decisions** as they're made

### Completing a Sprint
1. Use SUMMARY_PROMPT.md to document completion
2. **Update this CLAUDE.md file** with:
   - New capabilities added
   - Sprint completion status
   - Any new patterns or conventions
   - Updated file structure if changed
3. Create handoff documentation in `/development_plan/sprint_summaries/`
4. Commit with descriptive message

## Key Patterns & Conventions

### API Development
```typescript
// Use createApiHandler wrapper for all endpoints
export const GET = createApiHandler(async (request, context) => {
  // Implementation
});
```

### Database Operations
```typescript
// Always scope queries by league_id for isolation
const data = await prisma.leaguePlayer.findMany({
  where: { leagueId: context.league.id }
});
```

### Error Handling
```typescript
// Use custom error classes with retry logic
throw new ESPNError('Message', 'ERROR_CODE', 401, retryable: false);
```

### AI Agent Pattern
```typescript
// Each agent maintains league-specific memory
class LeagueAgent extends BaseAgent {
  constructor(leagueId: string) {
    super(leagueId);
    // League-isolated initialization
  }
}
```

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://rumbledore_dev:localdev123@localhost:5432/rumbledore
DIRECT_DATABASE_URL=postgresql://rumbledore_dev:localdev123@localhost:5432/rumbledore

# Redis
REDIS_URL=redis://localhost:6379

# Security
ENCRYPTION_MASTER_KEY=[32-character-key]
JWT_SECRET=[secret-key]

# External APIs (add as needed)
OPENAI_API_KEY=sk-...
THE_ODDS_API_KEY=...

# ESPN (stored encrypted in DB)
# Do not store ESPN cookies in env files
```

## Common Commands

```bash
# Development
npm run dev                    # Start development server
npm run docker:up             # Start Docker services
npm run docker:reset          # Reset Docker environment

# Database
npm run db:migrate            # Run migrations
npm run db:seed              # Seed test data
npm run db:reset             # Reset database

# Testing
npm test                      # Run all tests
npm run test:coverage        # Generate coverage report
npm run test:watch           # Watch mode

# Code Quality
npm run lint                  # Run ESLint
npm run type-check           # TypeScript validation
npm run format               # Prettier formatting
```

## Performance Targets

- **API Response**: < 200ms p95
- **Page Load**: < 2s
- **ESPN Sync**: < 5 minutes for full league
- **AI Generation**: < 10 seconds per article
- **Test Coverage**: > 90%
- **Mobile Performance**: Equal to desktop

## Security Considerations

### Never Store in Code
- ESPN cookies (use encrypted DB storage)
- API keys (use environment variables)
- User passwords (use bcrypt hashing)
- Sensitive league data (use RLS)

### Always Implement
- Input validation (Zod schemas)
- SQL injection prevention (Prisma)
- XSS protection (React default)
- CSRF protection (Next.js)
- Rate limiting (Redis-based)

## Testing Strategy

### Unit Tests
- Components (React Testing Library)
- API routes (Supertest)
- Utilities (Jest)
- Database operations (pg-mem)

### Integration Tests
- ESPN API integration
- End-to-end data flow
- AI agent interactions
- Betting calculations

### Manual Testing
- Mobile responsiveness
- League isolation
- Cookie capture flow
- Error scenarios

## Troubleshooting Guide

### Common Issues

#### Docker won't start
```bash
docker-compose down -v
docker system prune -a
docker-compose up -d
```

#### Database connection errors
```bash
# Check PostgreSQL status
docker-compose ps
docker-compose logs postgres

# Verify DATABASE_URL in .env.local
```

#### TypeScript errors after schema changes
```bash
npm run db:generate
# Restart TS server in VS Code: Cmd+Shift+P -> "TypeScript: Restart TS Server"
```

#### ESPN cookie issues
- Ensure cookies are captured from fantasy.espn.com
- Check cookie expiration in admin UI
- Validate against ESPN API endpoint
- Re-capture if expired

## Sprint-Specific Notes

### Sprint 1: Local Development Setup
- Focus: Docker environment and database schema
- Key files: docker-compose.yml, prisma/schema.prisma
- Validation: All services running, migrations successful

### Sprint 2: ESPN Authentication
- Focus: Cookie security and browser extension
- Key files: lib/crypto/*, browser-extension/*
- Validation: Cookies encrypted, extension working

### Sprint 3: Data Ingestion Pipeline
- Focus: Real-time sync and caching
- Key files: lib/espn/client.ts, lib/queue/*
- Validation: Data syncing correctly, cache hit ratio >80%

### Sprint 4: Historical Data Import
- Focus: Batch processing and normalization
- Key files: lib/espn/historical.ts, scripts/import.ts
- Validation: 10 years imported successfully

## AI Agent Memory

When implementing AI agents, remember:
1. Each league has isolated memory in `league_agent_memory` table
2. Use pgvector for semantic search (1536 dimensions)
3. Implement short-term and long-term memory
4. Store conversation context per league

## Important Links

### Documentation
- [Development Plan](/development_plan/README.md)
- [Architecture](/development_plan/ARCHITECTURE.md)
- [Principles](/development_plan/PRINCIPLES.md)
- [Current Sprint](/development_plan/phase_1_espn_foundation/sprint_1_local_setup.md)

### External Resources
- [ESPN Fantasy API (Unofficial)](https://github.com/cwendt/espn-fantasy-football-api)
- [The Odds API](https://the-odds-api.com/)
- [OpenAI API](https://platform.openai.com/docs)
- [shadcn/ui](https://ui.shadcn.com/)

## Update Instructions

**CRITICAL**: This file must be updated at the end of each sprint with:

1. **Sprint Completion Status**: Mark completed sprints with ✅
2. **New Capabilities**: Document any new features or tools added
3. **File Structure Changes**: Update the project structure if modified
4. **Environment Variables**: Add any new required variables
5. **Common Commands**: Add new useful commands discovered
6. **Troubleshooting**: Document new issues and solutions
7. **Performance Metrics**: Update actual performance numbers
8. **Patterns & Conventions**: Add new patterns established
9. **Dependencies**: Note new packages added
10. **Known Issues**: Document any unresolved issues

**Remember**: The next developer (or AI assistant) relies on this file being current and accurate. Update it as part of your sprint completion checklist!

---

*Last Updated: Development Planning Phase - All 16 Sprints Documented*
*Next Update Due: End of Sprint 1 Implementation*