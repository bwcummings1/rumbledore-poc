# 🚀 QUICKSTART - Rumbledore Development

**START HERE** - This is your entry point for the Rumbledore project.

## Prerequisites Check

Before starting, ensure you have:
- [ ] Node.js 20 LTS installed (`node --version`)
- [ ] Docker Desktop installed and running
- [ ] Git configured
- [ ] VS Code or preferred IDE
- [ ] At least 10GB free disk space
- [ ] ESPN Fantasy account (for testing)

## Step 1: Initial Project Setup (First Time Only)

```bash
# Clone and enter project (if not already done)
cd /Users/bwc/Documents/projects/rumbledore

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Start Docker services
npm run docker:up

# Wait for services to be healthy (about 30 seconds)
docker-compose ps

# Run database migrations
npm run db:migrate

# Seed test data
npm run db:seed

# Verify setup
npm run verify:setup
```

## Step 2: Understanding the Development Plan

### 📚 Required Reading Order
1. **[/development_plan/README.md](./development_plan/README.md)** - Project overview and timeline
2. **[/development_plan/PRINCIPLES.md](./development_plan/PRINCIPLES.md)** - Core development principles
3. **[/development_plan/ARCHITECTURE.md](./development_plan/ARCHITECTURE.md)** - System design
4. **[/CLAUDE.md](./CLAUDE.md)** - AI assistant context (always keep updated!)

### 📂 Key Directories
- `/development_plan/` - All sprint documentation
- `/development_plan/phase_X/` - Phase-specific sprints
- `/development_plan/sprint_summaries/` - Completed sprint records

## Step 3: Starting a Sprint

### For AI Assistants (Claude)
1. **Load Context**:
   ```
   Please read:
   - /CLAUDE.md
   - /development_plan/SPRINT_WORKFLOW.md
   - /development_plan/phase_X/sprint_N.md (current sprint)
   ```

2. **Use Introduction Prompt**:
   - Copy the entire `/development_plan/INTRODUCTION_PROMPT.md`
   - Replace placeholders with current sprint info
   - Paste as your first message to Claude

3. **Begin Development**:
   - Claude will conduct gap analysis
   - Present development plan
   - Use TodoWrite tool for task tracking

### For Human Developers
1. **Review Current State**:
   ```bash
   # Check current sprint status
   cat development_plan/CURRENT_SPRINT.txt
   
   # View sprint documentation
   code development_plan/phase_1_espn_foundation/sprint_1_local_setup.md
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

3. **Run Tests Continuously**:
   ```bash
   # In a new terminal
   npm run test:watch
   ```

## Step 4: During Development

### Daily Workflow
```bash
# Morning: Check system health
npm run health:check

# Start development
npm run dev

# Run tests before commits
npm test

# Check types
npm run type-check

# Lint code
npm run lint
```

### Common Tasks
- **Add new dependency**: `npm install [package] && npm run type-check`
- **Database changes**: `npm run db:migrate && npm run db:generate`
- **Clear cache**: `npm run cache:clear`
- **Reset environment**: `npm run docker:reset`

## Step 5: Completing a Sprint

### For AI Assistants
1. Use `/development_plan/SUMMARY_PROMPT.md` template
2. Fill in all sections with actual data
3. **CRITICAL**: Update `/CLAUDE.md` with sprint results
4. Save summary to `/development_plan/sprint_summaries/`
5. Create handoff document

### For Human Developers
1. Run validation: `npm run sprint:validate`
2. Update documentation
3. Commit with proper message format
4. Tag sprint completion: `git tag sprint-N-complete`

## Step 6: Moving to Next Sprint

1. **Update Sprint Tracker**:
   ```bash
   echo "Phase X, Sprint N+1: [Name]" > development_plan/CURRENT_SPRINT.txt
   ```

2. **Verify Prerequisites**:
   ```bash
   npm run sprint:prerequisites
   ```

3. **Start Next Sprint**:
   - Return to Step 3 with new sprint number

## Quick Commands Reference

```bash
# Development
npm run dev                 # Start Next.js dev server
npm run docker:up          # Start Docker services
npm run docker:down        # Stop Docker services
npm run docker:reset       # Full reset

# Database
npm run db:migrate         # Run migrations
npm run db:seed           # Seed test data
npm run db:reset          # Full database reset
npm run db:studio         # Open Prisma Studio

# Testing
npm test                   # Run all tests
npm run test:watch        # Watch mode
npm run test:coverage     # Coverage report
npm run test:e2e          # End-to-end tests

# Code Quality
npm run lint              # ESLint
npm run type-check        # TypeScript check
npm run format            # Prettier format

# Sprint Management
npm run sprint:validate   # Validate current sprint
npm run sprint:complete   # Mark sprint complete
npm run health:check      # System health check
```

## Troubleshooting

### Docker Issues
```bash
# If containers won't start
docker-compose down -v
docker system prune -a
docker-compose up -d
```

### Database Issues
```bash
# If migrations fail
npm run db:reset
npm run db:migrate
npm run db:seed
```

### Type Errors
```bash
# After schema changes
npm run db:generate
# Restart TS server in VS Code
```

## Getting Help

1. Check `/development_plan/TROUBLESHOOTING.md`
2. Review sprint-specific documentation
3. Check `/CLAUDE.md` for known issues
4. Search previous sprint summaries

## Important Files to Never Delete

- `/CLAUDE.md` - AI context (always keep updated!)
- `/development_plan/` - All documentation
- `/.env.local` - Your environment configuration
- `/prisma/migrations/` - Database migration history

---

**Ready to start?** 
- For Sprint 1: Open `/development_plan/phase_1_espn_foundation/sprint_1_local_setup.md`
- For AI: Load `/development_plan/INTRODUCTION_PROMPT.md` with Sprint 1 details

*Remember: Update CLAUDE.md after EVERY sprint!*