# SYSTEM CONTEXT: Rumbledore Fantasy Platform - `Phase [X]: [PHASE_NAME] | Sprint [N]: [SPRINT_NAME]` Implementation

Ultrathink as an AI assistant responsible for the optimal, comprehensive development of `Sprint [N]: [SPRINT_NAME]` for `Phase [X]: [PHASE_NAME]` of the Rumbledore fantasy football platform, a comprehensive dashboard integrating ESPN league data with AI-driven content generation and paper betting features.

## Project Overview

- **Location**: /Users/bwc/Documents/projects/rumbledore
- **Purpose**: Fantasy football platform with sandboxed league architecture, AI-driven content per league, and multi-tier paper betting competitions
- **Approach**: 16 sprints across 5 phases (32 weeks total development)
- **Current Architecture**: Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui

## Foundation Status

The following phases are complete:
- ✅ Phase 0: UI/UX Foundation (Dark theme, responsive design, chat system)
*[Update checkmarks based on actual completion status]*

The following phases are incomplete:
- Phase 1: ESPN Foundation & Core Infrastructure (Sprints 1-4)
- Phase 2: League Intelligence & Analytics (Sprints 5-7)
- Phase 3: AI Content & Agent Architecture (Sprints 8-11)
- Phase 4: Paper Betting System (Sprints 12-14)
- Phase 5: Production & Scale (Sprints 15-16)
*[Update as phases complete]*

## Core Project Files You Should Reference

### Primary Documentation
- **`/CLAUDE.md`** - 🔴 **CRITICAL: Your AI assistant context and guidelines - READ THIS FIRST!**
- `/development_plan/README.md` - Master development guide
- `/development_plan/ARCHITECTURE.md` - System architecture patterns
- `/development_plan/PRINCIPLES.md` - Guiding development principles
- `/development_plan/phase_[X]_[PHASE_NAME]/README.md` - Phase overview
- `/development_plan/phase_[X]_[PHASE_NAME]/sprint_[N]_[SPRINT_NAME].md` - Sprint details
- `/development_plan/INTRODUCTION_PROMPT.md` - This sprint introduction template
- `/development_plan/SUMMARY_PROMPT.md` - Sprint completion template

### Existing Codebase
- `/app/(dashboard)/` - Dashboard routes and layouts
- `/components/dashboard/` - Dashboard UI components
- `/components/chat/` - Chat system with Zustand
- `/types/` - TypeScript type definitions
- `/lib/` - Utilities and integrations
- `/data/` - Mock data for development

### Configuration Files
- `/package.json` - Dependencies and scripts
- `/tsconfig.json` - TypeScript configuration
- `/tailwind.config.ts` - Tailwind CSS configuration
- `/next.config.js` - Next.js configuration

## Development Philosophy

### Core Architecture Principles
1. **Sandboxed Leagues**: Complete isolation between leagues
2. **Local-First Development**: Test everything locally before external dependencies
3. **Mobile-Desktop Parity**: Equal priority for all device types
4. **Data Integrity**: 100% accuracy for league statistics
5. **AI Authenticity**: Content that feels genuine to each league

### Engineering Principles
1. **Progressive Enhancement**: Build simple working systems first
2. **Fail-Safe Design**: Plan rollback before implementation
3. **Measurement-Driven**: Every feature has quantifiable success criteria
4. **Security by Default**: Encrypt sensitive data, secure APIs
5. **Performance Baseline**: Sub-200ms API responses

## Technical Context

### UI/UX Foundation (Already Implemented)
- **Theme**: Dark mode with Geist font family
- **Design System**: shadcn/ui (New York variant) with Tailwind CSS
- **Responsive**: Mobile-first design with full desktop parity
- **Chat System**: Real-time chat with Zustand state management
- **Layout**: Collapsible sidebar, responsive grid layouts
- **Components**: Customized shadcn/ui components with consistent styling
- **Animations**: Smooth transitions using Tailwind animate
- **Colors**: Dark theme with zinc/slate palette, primary accent colors

### Existing Codebase Structure
```
rumbledore/
├── app/                      # Next.js 15 App Router
│   ├── (auth)/              # Authentication routes
│   ├── (dashboard)/         # Main application
│   └── api/                 # API routes
├── components/              # React components
│   ├── dashboard/          # Dashboard components
│   ├── chat/              # Chat system with Zustand
│   └── ui/                # shadcn/ui components (New York)
├── lib/                    # Core utilities
│   ├── espn/              # ESPN integration (to build)
│   ├── ai/                # AI agents (to build)
│   └── betting/           # Betting system (to build)
├── types/                  # TypeScript definitions
├── data/                   # Mock data
└── development_plan/       # This documentation
```

### Key Integration Points
- **ESPN API**: Cookie-based authentication for data access
- **PostgreSQL**: Main database with pgvector for embeddings
- **Redis**: Caching layer for performance
- **OpenAI API**: Initial AI provider for content generation
- **The Odds API**: Sports betting data provider

---

## `Sprint [N]: [SPRINT_NAME]`

You are implementing `Sprint [N]: [SPRINT_NAME]` of the Rumbledore platform, following the successful completion of `Sprint [N-1]: [PREVIOUS_SPRINT_NAME]`.

---

### 📋 Inherited Context from `Sprint [N-1]: [PREVIOUS_SPRINT_NAME]`

*[Insert handoff documentation from previous sprint]*

---

## 🎯 Your Mission: `Sprint [N]: [SPRINT_NAME]` Implementation

**Phase**: [X] - [PHASE_NAME] (Sprint [SPRINT_NUMBER] of [TOTAL_PHASE_SPRINTS])  
**Focus**: [One-line description of primary objective]  
**Duration**: 2 weeks  
**Risk Level**: [Low/Medium/High]  

### 🔍 CRITICAL: Conduct Gap Analysis First

Before planning, you MUST analyze:

1. **Current State (✅ What We Have)**:
   - Review inherited context from previous sprint
   - Verify prerequisites are met
   - Check existing capabilities
   - Confirm integration points work

2. **Target State (❌ What We Need)**:
   - Read sprint documentation thoroughly
   - Identify all deliverables
   - Note missing capabilities
   - List required integrations

3. **Gap Identification**:
   - Specific missing pieces
   - Technical challenges
   - Integration requirements
   - Performance improvements needed

### 📚 Required Reading

1. **Sprint Documentation**:
   - `/development_plan/phase_[X]_[PHASE_NAME]/sprint_[N]_[SPRINT_NAME].md` - Full sprint details
   - Previous sprint handoff if available
   - Related phase documentation

2. **Technical References**:
   - Relevant API documentation
   - Database schema designs
   - Integration specifications

### 🎭 Your Workflow

#### Phase 1: PLAN MODE (Use TodoWrite tool)
1. **Gap Analysis**:
   - Document current vs. target state
   - List specific gaps to close
   - Identify risks and dependencies

2. **Present Comprehensive Plan**:
   - Task breakdown with time estimates
   - Code structure for major components
   - Database schema changes
   - API endpoint designs
   - Risk assessment with mitigation strategies
   - Rollback procedures (pre-planned)
   - Validation strategy with metrics
   - Performance targets and benchmarks

3. **Use TodoWrite Tool**:
   - Create todo list for all tasks
   - Mark priorities and dependencies
   - Track progress throughout sprint

#### Phase 2: IMPLEMENTATION (After Plan Approval)
1. **Pre-Implementation Checkpoint**:
   - Verify all prerequisites
   - Set up local development environment
   - Create feature branches
   - Configure monitoring

2. **Iterative Development**:
   - Implement task by task
   - Update todo list as you progress
   - Test each component immediately
   - Document decisions as you make them
   - Check performance against targets

3. **Continuous Validation**:
   - Run tests after each task
   - Check integration points
   - Monitor performance metrics
   - Verify no regression

#### Phase 3: HANDOFF PREPARATION
1. **Generate Comprehensive Handoff**:
   - Use SUMMARY_PROMPT.md template
   - Include all completed work
   - Document technical decisions
   - Note any technical debt

2. **Update Project Documentation**:
   - **🔴 CRITICAL: Update `/CLAUDE.md` with sprint completion and new capabilities**
   - Update phase README with completion status
   - Create sprint summary in sprint_summaries/
   - Update API documentation
   - Record lessons learned
   - Document any new UI/UX patterns or components created

### ⚠️ Critical Constraints

#### Performance Targets
- **API Response Time**: < 200ms p95
- **Page Load Time**: < 2s
- **Data Sync Time**: < 5 minutes
- **AI Generation**: < 10 seconds
- **Test Coverage**: > 90%

#### Integration Requirements
- Must maintain backward compatibility
- Must respect league isolation boundaries
- Must work offline where applicable
- Must handle ESPN API failures gracefully

### 🚀 Success Criteria

Sprint is successful when:
- [ ] All primary objectives completed
- [ ] Performance targets met
- [ ] Integration tests passing
- [ ] Documentation complete
- [ ] Handoff document created
- [ ] No critical bugs
- [ ] Technical debt documented
- [ ] Next sprint can proceed

### 🛠️ Available Tools and Patterns

Remember to use:
- **TodoWrite**: Track all tasks and progress
- **Bash**: Run commands and scripts
- **Read/Write/Edit**: Manage files
- **Grep/Glob**: Search codebase
- **Task**: Complex multi-step operations

### 📝 Final Checklist Before Starting

- [ ] **I have read `/CLAUDE.md` for project context and current state**
- [ ] I understand the project context
- [ ] I've reviewed the inherited sprint state
- [ ] I understand the sandboxed architecture
- [ ] I know the performance targets
- [ ] I'm ready to conduct gap analysis
- [ ] I will use TodoWrite for task tracking
- [ ] I will maintain mobile-desktop parity
- [ ] I will create proper handoff documentation
- [ ] **I will update `/CLAUDE.md` upon sprint completion**

---

**Begin by**:
1. **🔴 FIRST: Read `/CLAUDE.md` to understand the current project state and context**
2. Ultrathinking your development strategy
3. Confirming you understand the project context and inherited sprint state
4. Reading the sprint documentation at `/development_plan/phase_[X]_[PHASE_NAME]/sprint_[N]_[SPRINT_NAME].md`
5. Conducting a thorough gap analysis
6. Presenting your comprehensive development plan using TodoWrite

*Remember: The goal is to build a platform that transforms how fantasy football leagues experience their competition through data, AI, and betting. Every line of code should serve this purpose.*