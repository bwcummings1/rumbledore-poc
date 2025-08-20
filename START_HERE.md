# 🚀 START HERE - Rumbledore Project Development Instructions

Welcome to the Rumbledore fantasy football platform project. This document provides the complete instructions for starting and executing the development of this project.

## 🎯 Project Goal
Build a comprehensive fantasy football platform with ESPN integration, AI-driven content generation, and paper betting features using a sandboxed architecture where each league operates in complete isolation.

## 📋 Before You Begin

### Prerequisites Checklist
```bash
# Check these requirements:
node --version          # Should be v20.x.x or higher
docker --version        # Docker Desktop should be installed
git --version          # Git should be configured
code --version         # VS Code or your preferred IDE
```

## 🏁 Step-by-Step Instructions

### Step 1: Initial Setup (One Time Only)

```bash
# 1. Navigate to project directory
cd /Users/bwc/Documents/projects/rumbledore

# 2. Review the quickstart guide
cat QUICKSTART.md

# 3. Install dependencies (if not already done)
npm install

# 4. Set up environment
cp .env.example .env.local
# Edit .env.local with your values

# 5. Start Docker services
npm run docker:up

# 6. Wait ~30 seconds, then verify
docker-compose ps
# All services should show "healthy"
```

### Step 2: Understand the Project Structure

**Read these documents in order:**
1. `QUICKSTART.md` - Entry point and command reference
2. `development_plan/README.md` - Project overview and phases
3. `development_plan/SPRINT_WORKFLOW.md` - How to execute sprints
4. `CLAUDE.md` - AI assistant context (critical for continuity)

**Key Directories:**
- `/development_plan/` - All sprint documentation
- `/development_plan/phase_1_espn_foundation/` - Current phase
- `/app/` - Next.js application code
- `/lib/` - Core utilities and integrations
- `/scripts/` - Development tools

### Step 3: Starting Sprint 1 (Current Sprint)

#### For AI Assistants (Claude):

1. **Initial Context Load:**
   ```
   Please read and understand:
   - /CLAUDE.md
   - /development_plan/SPRINT_WORKFLOW.md
   - /development_plan/phase_1_espn_foundation/sprint_1_Local_Development_Setup.md
   ```

2. **Use the Introduction Prompt:**
   - Open `/development_plan/INTRODUCTION_PROMPT.md`
   - Replace placeholders:
     - [X] → 1
     - [PHASE_NAME] → ESPN Foundation & Core Infrastructure
     - [N] → 1
     - [SPRINT_NAME] → Local Development Setup
   - Paste the complete prompt as your first message

3. **Development Workflow:**
   - Claude will perform gap analysis
   - Present development plan using TodoWrite
   - Begin implementation
   - Update progress continuously

#### For Human Developers:

1. **Check Current Sprint:**
   ```bash
   npm run sprint:status
   # Should show: Phase 1, Sprint 1: Local Development Setup
   ```

2. **Open Sprint Documentation:**
   ```bash
   code development_plan/phase_1_espn_foundation/sprint_1_Local_Development_Setup.md
   ```

3. **Start Development Environment:**
   ```bash
   # Terminal 1 - Services
   npm run docker:up
   
   # Terminal 2 - Development Server
   npm run dev
   
   # Terminal 3 - Tests
   npm run test:watch
   
   # Browser
   open http://localhost:3000
   ```

### Step 4: Daily Development Workflow

**Every Day:**
```bash
# Morning
npm run health:check        # Verify system health
npm run sprint:status       # Check current sprint

# During Development
npm run dev                 # Development server
npm test                    # Run tests frequently
npm run type-check         # Check TypeScript
npm run lint               # Check code quality

# Before Commits
npm run test:all           # Full test suite
git add -A
git commit -m "feat: descriptive message"
```

### Step 5: Completing a Sprint

**For AI Assistants:**
1. Use `/development_plan/SUMMARY_PROMPT.md`
2. Fill in all sections with actual data
3. **CRITICAL: Update CLAUDE.md** with all changes
4. Save summary to `/development_plan/sprint_summaries/`

**For Everyone:**
```bash
# Validate sprint completion
npm run sprint:validate

# Mark complete
npm run sprint:complete

# Commit final changes
git add -A
git commit -m "Sprint 1: Local Development Setup - Completed"
git tag sprint-1-complete
```

### Step 6: Moving to Next Sprint

```bash
# Update sprint tracker
echo "Phase 1, Sprint 2: ESPN Authentication" > development_plan/CURRENT_SPRINT.txt

# Check prerequisites
npm run sprint:prerequisites

# Start next sprint (repeat from Step 3)
```

## 📊 Progress Tracking

### Current Status
- **Phase**: 1 of 5 (ESPN Foundation)
- **Sprint**: 1 of 16 (Local Development Setup)
- **Duration**: 2 weeks per sprint
- **Total Timeline**: 32 weeks

### Sprint Overview
| Sprint | Phase | Focus | Status |
|--------|-------|-------|--------|
| 1 | 1 | Local Development Setup | 🔄 Current |
| 2 | 1 | ESPN Authentication | ⏸️ Pending |
| 3 | 1 | Data Ingestion Pipeline | ⏸️ Pending |
| 4 | 1 | Historical Data Import | ⏸️ Pending |
| 5-7 | 2 | League Intelligence | ⏸️ Pending |
| 8-11 | 3 | AI Architecture | ⏸️ Pending |
| 12-14 | 4 | Paper Betting | ⏸️ Pending |
| 15-16 | 5 | Production Scale | ⏸️ Pending |

## 🔧 Quick Problem Solving

### If Docker won't start:
```bash
npm run docker:reset
```

### If tests are failing:
```bash
npm run db:test:reset
npm run cache:clear
```

### If TypeScript has errors:
```bash
npm run db:generate
# Then restart TS server in VS Code
```

### If you're lost:
```bash
# Check current status
npm run sprint:status
cat CLAUDE.md | head -50

# Review current sprint
code development_plan/phase_1_espn_foundation/sprint_1_Local_Development_Setup.md
```

## 💡 Critical Success Factors

### DO:
- ✅ Update CLAUDE.md after EVERY sprint
- ✅ Test everything locally first
- ✅ Maintain mobile responsiveness
- ✅ Keep leagues completely isolated
- ✅ Document decisions as you make them
- ✅ Use TodoWrite for task tracking
- ✅ Commit frequently with clear messages

### DON'T:
- ❌ Skip the gap analysis phase
- ❌ Store ESPN cookies in code
- ❌ Mix data between leagues
- ❌ Ignore test failures
- ❌ Forget to update documentation
- ❌ Rush through validation

## 🚦 Ready to Start?

1. **Verify Setup:**
   ```bash
   npm run health:check
   ```

2. **Confirm Sprint:**
   ```bash
   npm run sprint:status
   ```

3. **Begin Development:**
   - AI: Load INTRODUCTION_PROMPT.md with Sprint 1 details
   - Human: Open sprint_1_Local_Development_Setup.md and start coding

4. **Track Progress:**
   - Use TodoWrite (AI)
   - Update CURRENT_SPRINT.txt
   - Commit frequently

## 📚 Resources

- **Documentation**: `/development_plan/`
- **Current Sprint**: `/development_plan/phase_1_espn_foundation/sprint_1_Local_Development_Setup.md`
- **AI Context**: `/CLAUDE.md`
- **Architecture**: `/development_plan/ARCHITECTURE.md`
- **Principles**: `/development_plan/PRINCIPLES.md`

## 🆘 Getting Help

1. Check `/development_plan/TROUBLESHOOTING.md`
2. Review sprint documentation
3. Check CLAUDE.md for known issues
4. Review previous sprint summaries in `/development_plan/sprint_summaries/`

---

**Remember**: The key to success is following the sprint workflow consistently and keeping CLAUDE.md updated. This ensures perfect continuity across all 16 sprints.

**Current Action**: Start with Sprint 1 - Local Development Setup

Good luck! 🚀