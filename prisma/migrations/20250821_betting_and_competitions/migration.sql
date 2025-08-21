-- Sprint 13 & 14: Betting Engine and Competition System
-- Creates tables for paper betting and competition management

-- ============================================================================
-- BETTING ENGINE ENUMS (Sprint 13)
-- ============================================================================

CREATE TYPE bet_type AS ENUM ('STRAIGHT', 'PARLAY');
CREATE TYPE bet_status AS ENUM ('PENDING', 'LIVE', 'WON', 'LOST', 'PUSH', 'CANCELLED', 'VOID');
CREATE TYPE bet_result AS ENUM ('WIN', 'LOSS', 'PUSH', 'VOID');
CREATE TYPE bet_slip_type AS ENUM ('SINGLE', 'PARLAY', 'ROUND_ROBIN');
CREATE TYPE bankroll_status AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- ============================================================================
-- COMPETITION ENUMS (Sprint 14)
-- ============================================================================

CREATE TYPE competition_type AS ENUM ('WEEKLY', 'SEASON', 'TOURNAMENT', 'CUSTOM');
CREATE TYPE competition_scope AS ENUM ('LEAGUE', 'PLATFORM');
CREATE TYPE competition_status AS ENUM ('PENDING', 'ACTIVE', 'SETTLING', 'COMPLETED', 'CANCELLED');
CREATE TYPE achievement_type AS ENUM (
  'COMPETITION_WIN',
  'COMPETITION_PLACE',
  'WEEKLY_BEST',
  'PERFECT_WEEK',
  'STREAK_MASTER',
  'ROI_CHAMPION',
  'PARTICIPATION',
  'BETTING_MILESTONE'
);
CREATE TYPE reward_type AS ENUM ('UNITS', 'BADGE', 'TITLE', 'MULTIPLIER');

-- ============================================================================
-- BETTING ENGINE TABLES (Sprint 13)
-- ============================================================================

-- Bankroll table - Weekly betting bankroll for users
CREATE TABLE bankrolls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  league_id UUID NOT NULL REFERENCES leagues(id),
  league_sandbox VARCHAR(255) NOT NULL,
  week INTEGER NOT NULL,
  season INTEGER NOT NULL,
  starting_balance DECIMAL(10,2) DEFAULT 1000.00,
  current_balance DECIMAL(10,2) NOT NULL,
  total_bets INTEGER DEFAULT 0,
  pending_bets INTEGER DEFAULT 0,
  won_bets INTEGER DEFAULT 0,
  lost_bets INTEGER DEFAULT 0,
  total_wagered DECIMAL(10,2) DEFAULT 0.00,
  total_won DECIMAL(10,2) DEFAULT 0.00,
  total_lost DECIMAL(10,2) DEFAULT 0.00,
  profit_loss DECIMAL(10,2) DEFAULT 0.00,
  roi DECIMAL(10,4),
  status bankroll_status DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_bankrolls_unique ON bankrolls(user_id, league_id, week, season);
CREATE INDEX idx_bankrolls_user ON bankrolls(user_id);
CREATE INDEX idx_bankrolls_league ON bankrolls(league_id);
CREATE INDEX idx_bankrolls_status ON bankrolls(status);

-- Bet slip table - For parlays and multi-bet slips (created before bets for FK reference)
CREATE TABLE bet_slips (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  league_id UUID NOT NULL REFERENCES leagues(id),
  league_sandbox VARCHAR(255) NOT NULL,
  type bet_slip_type DEFAULT 'SINGLE',
  total_stake DECIMAL(10,2) NOT NULL,
  total_odds INTEGER NOT NULL,
  potential_payout DECIMAL(10,2) NOT NULL,
  actual_payout DECIMAL(10,2),
  status bet_status DEFAULT 'PENDING',
  result bet_result,
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bet_slips_user ON bet_slips(user_id);
CREATE INDEX idx_bet_slips_league ON bet_slips(league_id);
CREATE INDEX idx_bet_slips_status ON bet_slips(status);

-- Bet table - Individual bets placed by users
CREATE TABLE bets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  league_id UUID NOT NULL REFERENCES leagues(id),
  league_sandbox VARCHAR(255) NOT NULL,
  bankroll_id UUID NOT NULL REFERENCES bankrolls(id),
  bet_slip_id UUID REFERENCES bet_slips(id),
  game_id VARCHAR(100) NOT NULL,
  event_date TIMESTAMP NOT NULL,
  bet_type bet_type NOT NULL,
  market_type market_type NOT NULL,
  selection VARCHAR(255) NOT NULL,
  line DECIMAL(10,2),
  odds INTEGER NOT NULL,
  stake DECIMAL(10,2) NOT NULL,
  potential_payout DECIMAL(10,2) NOT NULL,
  actual_payout DECIMAL(10,2),
  status bet_status DEFAULT 'PENDING',
  result bet_result,
  metadata JSONB DEFAULT '{}',
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_bets_user ON bets(user_id);
CREATE INDEX idx_bets_league ON bets(league_id);
CREATE INDEX idx_bets_bankroll ON bets(bankroll_id);
CREATE INDEX idx_bets_slip ON bets(bet_slip_id);
CREATE INDEX idx_bets_game ON bets(game_id);
CREATE INDEX idx_bets_status ON bets(status);
CREATE INDEX idx_bets_created ON bets(created_at);

-- Settlement table - Tracks bet settlements
CREATE TABLE settlements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  bet_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  league_id UUID NOT NULL REFERENCES leagues(id),
  league_sandbox VARCHAR(255) NOT NULL,
  game_id VARCHAR(100) NOT NULL,
  bet_amount DECIMAL(10,2) NOT NULL,
  payout_amount DECIMAL(10,2) NOT NULL,
  result bet_result NOT NULL,
  game_score JSONB NOT NULL,
  settled_by VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_settlements_user_league ON settlements(user_id, league_id);
CREATE INDEX idx_settlements_bet ON settlements(bet_id);
CREATE INDEX idx_settlements_game ON settlements(game_id);
CREATE INDEX idx_settlements_created ON settlements(created_at);

-- ============================================================================
-- COMPETITION TABLES (Sprint 14)
-- ============================================================================

-- Competition table - Defines competitions
CREATE TABLE competitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  type competition_type NOT NULL,
  scope competition_scope NOT NULL,
  league_id UUID REFERENCES leagues(id),
  league_sandbox VARCHAR(255),
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  week INTEGER,
  season INTEGER,
  entry_fee DECIMAL(10,2) DEFAULT 0,
  prize_pool DECIMAL(10,2) DEFAULT 0,
  max_entrants INTEGER,
  min_entrants INTEGER DEFAULT 2,
  scoring_rules JSONB NOT NULL,
  status competition_status DEFAULT 'PENDING',
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_competitions_league_status ON competitions(league_id, status);
CREATE INDEX idx_competitions_scope_status ON competitions(scope, status);
CREATE INDEX idx_competitions_dates ON competitions(start_date, end_date);
CREATE INDEX idx_competitions_creator ON competitions(created_by);

-- Competition entry table - Tracks participants
CREATE TABLE competition_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMP DEFAULT NOW(),
  rank INTEGER,
  score DECIMAL(10,2) DEFAULT 0,
  profit DECIMAL(10,2) DEFAULT 0,
  roi DECIMAL(10,4),
  win_rate DECIMAL(5,2),
  total_bets INTEGER DEFAULT 0,
  won_bets INTEGER DEFAULT 0,
  stats JSONB,
  last_update TIMESTAMP
);

CREATE UNIQUE INDEX idx_competition_entries_unique ON competition_entries(competition_id, user_id);
CREATE INDEX idx_competition_entries_rank ON competition_entries(competition_id, rank);
CREATE INDEX idx_competition_entries_user ON competition_entries(user_id);

-- Leaderboard table - Cached standings
CREATE TABLE leaderboards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id UUID UNIQUE NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  standings JSONB NOT NULL,
  last_calculated TIMESTAMP NOT NULL,
  version INTEGER DEFAULT 1,
  calculated_by VARCHAR(50)
);

CREATE INDEX idx_leaderboards_calculated ON leaderboards(last_calculated);

-- Achievement table - User achievements
CREATE TABLE achievements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  league_id UUID REFERENCES leagues(id),
  type achievement_type NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(255),
  metadata JSONB,
  progress INTEGER DEFAULT 0,
  target INTEGER,
  unlocked_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_achievements_user_type ON achievements(user_id, type);
CREATE INDEX idx_achievements_league ON achievements(league_id);
CREATE INDEX idx_achievements_unlocked ON achievements(unlocked_at);

-- Competition reward table - Tracks rewards
CREATE TABLE competition_rewards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  placement INTEGER NOT NULL,
  reward_type reward_type NOT NULL,
  reward_value JSONB NOT NULL,
  claimed_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_competition_rewards_unique ON competition_rewards(competition_id, user_id, reward_type);
CREATE INDEX idx_competition_rewards_user_claimed ON competition_rewards(user_id, claimed_at);
CREATE INDEX idx_competition_rewards_placement ON competition_rewards(competition_id, placement);

-- Add foreign key constraint for bet_slips that references bets
ALTER TABLE bets DROP CONSTRAINT IF EXISTS bets_bet_slip_id_fkey;
ALTER TABLE bets ADD CONSTRAINT bets_bet_slip_id_fkey 
  FOREIGN KEY (bet_slip_id) REFERENCES bet_slips(id) ON DELETE CASCADE;