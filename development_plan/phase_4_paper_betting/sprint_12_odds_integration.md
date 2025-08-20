# Sprint 12: Odds Integration

## Sprint Overview
Integrate The Odds API to fetch real-time betting lines from major sportsbooks with efficient caching.

**Duration**: 2 weeks (Week 1-2 of Phase 4)  
**Dependencies**: Phase 3 complete (AI system for predictions)  
**Risk Level**: Low - Well-documented API integration

## Implementation Guide

### Odds API Client

```typescript
// /lib/betting/odds-client.ts
import axios from 'axios';
import { Redis } from 'ioredis';

export class OddsApiClient {
  private apiKey: string;
  private redis: Redis;
  private baseUrl = 'https://api.the-odds-api.com/v4';

  constructor() {
    this.apiKey = process.env.ODDS_API_KEY!;
    this.redis = new Redis(process.env.REDIS_URL!);
  }

  async getNFLOdds(markets: string[] = ['h2h', 'spreads', 'totals']): Promise<GameOdds[]> {
    const cacheKey = `odds:nfl:${markets.join(',')}`;
    
    // Check cache first
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const response = await axios.get(`${this.baseUrl}/sports/americanfootball_nfl/odds`, {
      params: {
        apiKey: this.apiKey,
        regions: 'us',
        markets: markets.join(','),
        oddsFormat: 'american',
        bookmakers: 'draftkings,fanduel,betmgm,caesars',
      },
    });

    const odds = response.data;
    
    // Cache for 5 minutes
    await this.redis.setex(cacheKey, 300, JSON.stringify(odds));
    
    // Store historical snapshot
    await this.storeHistoricalOdds(odds);
    
    return odds;
  }

  private async storeHistoricalOdds(odds: any[]) {
    const snapshot = {
      timestamp: new Date(),
      odds,
    };

    await prisma.oddsSnapshot.create({
      data: {
        sport: 'NFL',
        data: snapshot,
      },
    });
  }

  async getPlayerProps(gameId: string): Promise<PlayerPropOdds[]> {
    const response = await axios.get(`${this.baseUrl}/sports/americanfootball_nfl/events/${gameId}/odds`, {
      params: {
        apiKey: this.apiKey,
        regions: 'us',
        markets: 'player_pass_tds,player_rush_yds,player_receptions',
        oddsFormat: 'american',
      },
    });

    return response.data;
  }

  async trackOddsMovement(gameId: string): Promise<OddsMovement> {
    const current = await this.getGameOdds(gameId);
    const historical = await this.getHistoricalOdds(gameId);
    
    return this.calculateMovement(current, historical);
  }

  private calculateMovement(current: any, historical: any[]): OddsMovement {
    // Calculate line movement and betting percentages
    return {
      spread: { 
        current: current.spread,
        open: historical[0]?.spread,
        movement: current.spread - historical[0]?.spread,
      },
      total: {
        current: current.total,
        open: historical[0]?.total,
        movement: current.total - historical[0]?.total,
      },
      moneyline: {
        current: current.moneyline,
        open: historical[0]?.moneyline,
        movement: current.moneyline - historical[0]?.moneyline,
      },
    };
  }
}
```

### Database Schema

```sql
-- Odds storage
CREATE TABLE odds_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sport VARCHAR(50) NOT NULL,
  game_id VARCHAR(100),
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE betting_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id VARCHAR(100) NOT NULL,
  bookmaker VARCHAR(50) NOT NULL,
  market_type VARCHAR(50) NOT NULL,
  line_value DECIMAL(10,2),
  odds_value INTEGER,
  team VARCHAR(100),
  is_home BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(game_id, bookmaker, market_type, team)
);

CREATE INDEX idx_betting_lines_game ON betting_lines(game_id);
CREATE INDEX idx_odds_snapshots_created ON odds_snapshots(created_at DESC);
```

## Success Criteria
- [ ] Odds fetching working
- [ ] Caching implemented
- [ ] Historical tracking functional
- [ ] Movement calculations accurate
- [ ] API rate limits respected
