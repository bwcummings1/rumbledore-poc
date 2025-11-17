# CLAUDE.md - Rumbledore Project Status

## Project Overview
Rumbledore is a fantasy football platform that enhances ESPN leagues with AI agents, paper betting, and real-time analytics.

## Current Status: FUNCTIONAL with ESPN Integration Pending

### ✅ What's Working
- **Authentication**: Signup/login flow with NextAuth
- **Database**: PostgreSQL + Redis running in Docker
- **Test Data**: 2 demo leagues with seeded data
- **Frontend**: React components with league context
- **API Structure**: REST endpoints with React Query
- **Onboarding**: Demo mode for testing without ESPN

### ⚠️ Needs Testing
- **ESPN Integration**: Browser extension → cookie capture → league sync
- **AI Agents**: 7 agents implemented, need OpenAI key testing
- **WebSocket**: Real-time updates implementation
- **Betting System**: Paper betting with odds integration

### 🔧 Known Issues
- Server runs on port 3001 (3000 in use)
- No signup API was missing (now fixed)
- ESPN connection required for full functionality

## Quick Start

```bash
# 1. Ensure Docker is running
docker-compose ps

# 2. Database is migrated and seeded
npm run db:migrate
npm run db:seed

# 3. Start dev server (runs on port 3001)
npm run dev

# 4. Test accounts available:
- admin@rumbledore.local (seeded, no password)
- test@example.com / testpass123 (created via API)
```

## Tech Stack
- **Frontend**: Next.js 15, TypeScript, Tailwind, shadcn/ui
- **Backend**: Prisma, PostgreSQL (pgvector), Redis
- **Auth**: NextAuth with JWT
- **AI**: LangChain + OpenAI (requires API key)
- **Real-time**: WebSocket via Socket.io

## File Structure
```
/app              → Next.js app router
/components       → React components  
/lib              → Core services
/prisma          → Database schema
/browser-extension → ESPN cookie capture
```

## Testing Path

1. **Without ESPN** (Working Now):
   - Sign up → Login → See demo leagues → Explore features

2. **With ESPN** (Needs Testing):
   - Install browser extension
   - Capture ESPN cookies
   - Send to Rumbledore
   - Sync league data

## Environment Variables Required
```env
# Database (working)
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Auth (working)
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3001

# External APIs (need real keys)
OPENAI_API_KEY=sk-...        # For AI agents
THE_ODDS_API_KEY=...          # For betting odds
```

## Next Steps

### Immediate
1. Test ESPN browser extension flow
2. Verify AI agents work with OpenAI key
3. Test WebSocket real-time updates

### Future
1. Production deployment configuration
2. Performance optimization
3. Additional test coverage

## Development Commands
```bash
npm run dev          # Start dev server
npm run db:studio    # Prisma Studio GUI
npm run db:seed      # Reset with test data
docker-compose ps    # Check services
```

## Notes
- Project architecture is solid
- Most features implemented, need integration testing
- Demo mode allows full testing without ESPN
- ESPN integration adds real league data

Last Updated: 2025-08-22