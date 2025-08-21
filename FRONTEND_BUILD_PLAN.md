# Frontend Build Plan - Completing the Missing Pieces

## 🎯 Current Reality

After auditing all components, here's what we discovered:
- **38 components were built** during sprints (mostly advanced features)
- **15-20 core components are missing** (basic league features)
- **Backend is 100% complete** with all APIs ready
- **Frontend is ~65% complete** but missing foundation pieces

## 🏗️ Build Plan Overview

### Total Estimated Time: 8-10 hours
- Phase 1: Core League Features (3 hours)
- Phase 2: Authentication (1 hour)
- Phase 3: Data Integration (2 hours)
- Phase 4: Real-time Features (1 hour)
- Phase 5: Polish & Testing (1-3 hours)

---

## Phase 1: Core League Features (3 hours)

### 1.1 League Detail Page (45 min)
```typescript
// app/(dashboard)/leagues/[leagueId]/page.tsx
- Fetch league data from API
- Display league info, settings, members
- Show current week, playoffs status
- Links to standings, rosters, matchups
```

### 1.2 Standings Table Component (30 min)
```typescript
// components/leagues/standings-table.tsx
- Sortable table with team records
- Points for/against
- Playoff indicators
- Trend arrows (last 3 games)
- Click to view team details
```

### 1.3 Roster Display Component (45 min)
```typescript
// components/leagues/roster-display.tsx
- Player list with positions
- Starting lineup vs bench
- Player stats and projections
- Injury indicators
- Add/drop buttons (future)
```

### 1.4 Matchup Display Component (30 min)
```typescript
// components/leagues/matchup-display.tsx
- Head-to-head matchup view
- Live scoring updates
- Player performance
- Projected vs actual points
```

### 1.5 Score Board Component (30 min)
```typescript
// components/leagues/score-board.tsx
- All matchups for current week
- Live score updates
- Quick view of all games
- Links to detailed matchups
```

---

## Phase 2: Authentication UI (1 hour)

### 2.1 Login Form (20 min)
```typescript
// app/auth/login/page.tsx
- Email/password fields
- Remember me checkbox
- Forgot password link
- Sign up link
- Error handling
```

### 2.2 Session Provider Wrapper (20 min)
```typescript
// app/providers.tsx
- NextAuth SessionProvider
- Wrap entire app
- Loading states
- Auth redirects
```

### 2.3 User Menu Component (20 min)
```typescript
// components/layout/user-menu.tsx
- User avatar/name
- Dropdown with profile, settings, logout
- League switcher
- Notification badge
```

---

## Phase 3: Data Integration (2 hours)

### 3.1 API Client Setup (30 min)
```typescript
// lib/api-client.ts
- Axios/fetch wrapper
- Auth token handling
- Error interceptors
- Type-safe requests
```

### 3.2 React Query Setup (30 min)
```typescript
// lib/query-client.ts
- Query client configuration
- Default options
- Cache settings
- Mutation helpers
```

### 3.3 Dashboard Data Hooks (30 min)
```typescript
// hooks/use-dashboard-data.ts
- Replace mock data with real API calls
- useLeagues, useStats, useNotifications
- Loading and error states
```

### 3.4 Update Existing Components (30 min)
- Connect BettingDashboard to real data
- Connect StatsDashboard to real data
- Connect AgentChat to WebSocket

---

## Phase 4: Real-time Features (1 hour)

### 4.1 WebSocket Provider (30 min)
```typescript
// providers/websocket-provider.tsx
- Socket.io client setup
- Connection management
- Reconnection logic
- Event subscriptions
```

### 4.2 Live Score Updates (30 min)
```typescript
// hooks/use-live-scores.ts
- Subscribe to score updates
- Update UI in real-time
- Handle connection issues
```

---

## Phase 5: ESPN Integration UI (Optional - 1 hour)

### 5.1 ESPN Setup Guide (30 min)
```typescript
// components/espn/setup-guide.tsx
- Step-by-step instructions
- Browser extension install
- Cookie capture guide
- Troubleshooting tips
```

### 5.2 Sync Controls (30 min)
```typescript
// components/espn/sync-controls.tsx
- Manual sync button
- Sync status display
- Last sync time
- Error messages
```

---

## 📁 File Structure After Implementation

```
app/
├── (dashboard)/
│   ├── leagues/
│   │   ├── page.tsx (existing)
│   │   └── [leagueId]/
│   │       ├── page.tsx (NEW)
│   │       ├── standings/page.tsx (NEW)
│   │       ├── roster/page.tsx (NEW)
│   │       └── matchups/page.tsx (NEW)
│   ├── betting/
│   │   └── page.tsx (existing)
│   └── chat/
│       └── page.tsx (existing)
├── auth/
│   ├── login/page.tsx (NEW)
│   └── signup/page.tsx (NEW)
└── providers.tsx (NEW)

components/
├── leagues/ (NEW FOLDER)
│   ├── standings-table.tsx
│   ├── roster-display.tsx
│   ├── matchup-display.tsx
│   ├── score-board.tsx
│   └── player-card.tsx
├── layout/ (NEW FOLDER)
│   ├── user-menu.tsx
│   └── notification-center.tsx
├── espn/ (NEW FOLDER)
│   ├── setup-guide.tsx
│   └── sync-controls.tsx
├── betting/ (existing, complete)
├── chat/ (existing, complete)
└── statistics/ (existing, complete)

hooks/ (NEW FOLDER)
├── use-leagues.ts
├── use-standings.ts
├── use-roster.ts
├── use-live-scores.ts
└── use-auth.ts

lib/
├── api-client.ts (NEW)
├── query-client.ts (NEW)
└── websocket-client.ts (enhance existing)
```

---

## 🚀 Implementation Order

### Day 1 (Core Features - 4 hours)
1. **Authentication UI** - Get login working first
2. **League Detail Page** - Main league dashboard
3. **Standings Table** - Show team rankings
4. **Roster Display** - Show team players

### Day 2 (Integration - 3 hours)
1. **API Client Setup** - Connect to backend
2. **Dashboard Real Data** - Replace mock data
3. **WebSocket Provider** - Enable real-time
4. **Live Scores** - Real-time updates

### Day 3 (Polish - 2-3 hours)
1. **Matchup Display** - Game details
2. **ESPN Integration** - Setup guide
3. **Testing** - Ensure everything works
4. **Bug Fixes** - Address issues

---

## ✅ Success Criteria

After implementation, the app should:
1. Allow users to log in/out
2. Display real leagues with real data
3. Show standings and rosters
4. Update scores in real-time
5. Have all existing components connected
6. No more mock data anywhere
7. Feel like a complete fantasy football app

---

## 🎯 Quick Wins First

If time is limited, prioritize:
1. **Login Form** (20 min) - Unlocks everything
2. **Standings Table** (30 min) - Core feature
3. **Connect Dashboard** (30 min) - Makes app feel real
4. **League Detail** (45 min) - Hub for everything

These 4 items (2 hours) would make the app functional!

---

## 📝 Notes

- All backend APIs are ready and tested
- WebSocket server is running
- Database has test data
- Most complex features already have UIs
- Focus is on building the "obvious" pieces that are missing

The irony: We built the complex AI chat and betting systems but forgot to build a simple standings table! Let's fix that.