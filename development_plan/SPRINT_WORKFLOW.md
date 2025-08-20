# Sprint Execution Workflow

This document defines the standard workflow for executing any sprint in the Rumbledore project.

## Sprint Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   PLANNING  │────▶│ DEVELOPMENT │────▶│ VALIDATION  │────▶│  HANDOFF    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     Day 1-2            Day 3-11           Day 12-13          Day 14
```

## Phase 1: Sprint Initialization (Day 1)

### Step 1.1: Load Context (AI)
```
Please read and understand IN THIS ORDER:
1. 🔴 /CLAUDE.md - CRITICAL: Current project state and context
2. /development_plan/phase_X/sprint_N.md - Sprint details
3. /development_plan/INTRODUCTION_PROMPT.md - Sprint start template
4. Previous sprint summary (if exists)
```

### Step 1.2: Verify Prerequisites
```bash
# Check system health
docker-compose ps
npm run health:check

# Verify previous sprint completion
cat development_plan/CURRENT_SPRINT.txt

# Check for blocking issues
npm run sprint:prerequisites
```

### Step 1.3: Create Sprint Branch
```bash
# Create feature branch
git checkout -b sprint-N-name

# Update sprint tracker
echo "Phase X, Sprint N: Name" > development_plan/CURRENT_SPRINT.txt
```

## Phase 2: Planning & Gap Analysis (Day 1-2)

### Step 2.1: Gap Analysis

**Current State Assessment**:
- [ ] Review inherited capabilities from previous sprint
- [ ] Verify all prerequisites are met
- [ ] Check existing code and structure
- [ ] Identify available tools and utilities

**Target State Definition**:
- [ ] Read sprint documentation thoroughly
- [ ] List all required deliverables
- [ ] Define success criteria
- [ ] Identify integration points

**Gap Documentation**:
```markdown
## Gap Analysis for Sprint N

### ✅ What We Have
- [Capability 1]
- [Capability 2]

### ❌ What We Need
- [Missing Capability 1]
- [Missing Capability 2]

### 🔧 How to Bridge
- [Task 1]: [Description]
- [Task 2]: [Description]
```

### Step 2.2: Create Development Plan

Using TodoWrite tool, create comprehensive task list:
```
1. Infrastructure Setup
   - [ ] Task 1.1
   - [ ] Task 1.2
2. Core Implementation
   - [ ] Task 2.1
   - [ ] Task 2.2
3. Integration
   - [ ] Task 3.1
4. Testing
   - [ ] Task 4.1
5. Documentation
   - [ ] Task 5.1
```

## Phase 3: Implementation (Day 3-11)

### Step 3.1: Daily Workflow

**Morning Routine**:
```bash
# 1. Check system health
npm run health:check

# 2. Pull latest changes
git pull origin main

# 3. Start services
npm run docker:up
npm run dev

# 4. Review todo list
# Update TodoWrite with current focus
```

**Development Cycle**:
```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│   CODE   │────▶│   TEST   │────▶│  COMMIT  │────▶│  UPDATE  │──┐
└──────────┘     └──────────┘     └──────────┘     └──────────┘  │
     ▲                                                             │
     └─────────────────────────────────────────────────────────────┘
```

1. **Write Code** (following patterns in CLAUDE.md)
2. **Test Immediately** (`npm test -- --watch`)
3. **Commit Frequently** (small, logical commits)
4. **Update TodoWrite** (mark tasks complete)

### Step 3.2: Testing Protocol

**After Each Feature**:
```bash
# Unit tests
npm test -- [feature]

# Type checking
npm run type-check

# Lint
npm run lint

# Integration test
npm run test:integration
```

### Step 3.3: Documentation During Development

Create/Update as you code:
- [ ] Inline code comments for complex logic
- [ ] Update type definitions
- [ ] Add to API documentation
- [ ] Note architectural decisions
- [ ] Document any workarounds

## Phase 4: Validation (Day 12-13)

### Step 4.1: Comprehensive Testing

```bash
# Full test suite
npm run test:all

# Coverage check
npm run test:coverage

# E2E tests
npm run test:e2e

# Performance benchmarks
npm run bench

# Security scan
npm run security:check
```

### Step 4.2: Sprint Validation Checklist

**Functional Requirements**:
- [ ] All TodoWrite tasks completed
- [ ] Sprint objectives achieved
- [ ] Success criteria met
- [ ] No regression in existing features

**Quality Requirements**:
- [ ] Test coverage >90%
- [ ] No TypeScript errors
- [ ] ESLint passing
- [ ] Performance targets met
- [ ] Mobile responsiveness verified

**Documentation Requirements**:
- [ ] Code documented
- [ ] API docs updated
- [ ] Architecture decisions recorded
- [ ] Known issues documented

### Step 4.3: Create Sprint Summary

Use `/development_plan/SUMMARY_PROMPT.md`:
1. Fill in all sections with actual data
2. Document gaps closed
3. List all files created/modified
4. Record performance metrics
5. Note technical decisions
6. Identify technical debt

## Phase 5: Handoff (Day 14)

### Step 5.1: Update Critical Documentation

**🔴 CLAUDE.md Updates** (ABSOLUTELY REQUIRED - DO NOT SKIP):
- [ ] Mark sprint as completed in status section
- [ ] Add new capabilities and features
- [ ] Update file structure if changed
- [ ] Add new commands discovered
- [ ] Document known issues for next sprint
- [ ] Update performance metrics with actuals
- [ ] Document any UI/UX patterns created
- [ ] Add new environment variables
- [ ] Update troubleshooting section
- [ ] Change "Last Updated" footer to current sprint

**Save Sprint Summary**:
```bash
# Save to both locations
cp sprint_N_summary.md development_plan/sprint_summaries/
cp sprint_N_summary.md development_plan/phase_X/sprint_N_handoff.md
```

### Step 5.2: Prepare Next Sprint

**Prerequisites Check**:
- [ ] Database migrations complete
- [ ] Dependencies installed
- [ ] Environment variables set
- [ ] Test data available
- [ ] No blocking issues

**Create Handoff Notes**:
```markdown
## Handoff to Sprint N+1

### ✅ Completed
- [Feature 1]
- [Feature 2]

### ⚠️ Needs Attention
- [Issue 1]
- [Technical debt 1]

### 📝 Next Sprint Should Start With
1. [First task]
2. [Second task]
```

### Step 5.3: Final Commit

```bash
# Stage all changes
git add -A

# Commit with standard message
git commit -m "Sprint N: [Name] - Completed

- [Key achievement 1]
- [Key achievement 2]
- [Key achievement 3]

Ready for Sprint N+1: Yes"

# Tag the completion
git tag sprint-N-complete

# Push to remote
git push origin sprint-N-name --tags
```

## Quick Reference: Sprint Commands

```bash
# Sprint Management
npm run sprint:start N        # Initialize sprint N
npm run sprint:validate       # Validate current sprint
npm run sprint:complete       # Mark sprint complete
npm run sprint:status         # Show current status

# Daily Development
npm run dev                   # Start development
npm run test:watch           # Continuous testing
npm run health:check         # System health

# Sprint Validation
npm run test:all             # All tests
npm run test:coverage        # Coverage report
npm run bench                # Performance tests
npm run security:check       # Security scan
```

## Common Patterns by Sprint Type

### Infrastructure Sprints (1, 8, 15)
- Focus on Docker, database, deployment
- Heavy testing of connections and health checks
- Document all configuration changes

### Feature Sprints (3, 4, 6, 9, 10, 12, 13)
- Implement core functionality
- Write comprehensive tests
- Focus on user-facing features

### Integration Sprints (2, 5, 7, 11, 14)
- Connect systems together
- Test data flow end-to-end
- Verify isolation boundaries

### Optimization Sprints (16)
- Benchmark everything
- Profile and optimize
- Document performance gains

## Troubleshooting Sprint Issues

### Sprint Won't Start
1. Check prerequisites: `npm run sprint:prerequisites`
2. Review previous sprint handoff
3. Verify system health: `npm run health:check`

### Tests Failing
1. Check for environment issues: `npm run verify:env`
2. Reset test database: `npm run db:test:reset`
3. Clear all caches: `npm run cache:clear`

### Performance Issues
1. Check Docker resources
2. Profile with: `npm run profile`
3. Review query performance in database

## Sprint Success Metrics

Every sprint should achieve:
- ✅ 100% of planned features delivered
- ✅ >90% test coverage
- ✅ <200ms API response times
- ✅ Zero critical bugs
- ✅ Complete documentation
- ✅ CLAUDE.md updated
- ✅ Clean handoff to next sprint

---

*Follow this workflow for every sprint to ensure consistency and quality across the entire Rumbledore development.*