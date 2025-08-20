-- Sprint 6: Statistics Engine - Database Schema
-- Creates tables for comprehensive statistics tracking and analysis

-- All-time records table for tracking league records
CREATE TABLE all_time_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  record_type VARCHAR(100) NOT NULL,
  record_holder_type VARCHAR(50) NOT NULL, -- 'TEAM' or 'PLAYER'
  record_holder_id VARCHAR(255) NOT NULL,
  record_value DECIMAL(10,2) NOT NULL,
  season VARCHAR(50),
  week INTEGER,
  opponent_id VARCHAR(255),
  date_achieved DATE,
  metadata JSONB DEFAULT '{}',
  previous_record_id UUID REFERENCES all_time_records(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create unique constraint and indexes
CREATE UNIQUE INDEX idx_all_time_records_unique ON all_time_records(league_id, record_type, record_holder_type);
CREATE INDEX idx_all_time_records_league ON all_time_records(league_id);
CREATE INDEX idx_all_time_records_type ON all_time_records(record_type);

-- Head-to-head records between teams
CREATE TABLE head_to_head_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  team1_id VARCHAR(255) NOT NULL,
  team2_id VARCHAR(255) NOT NULL,
  total_matchups INTEGER DEFAULT 0,
  team1_wins INTEGER DEFAULT 0,
  team2_wins INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  team1_total_points DECIMAL(10,2) DEFAULT 0,
  team2_total_points DECIMAL(10,2) DEFAULT 0,
  team1_highest_score DECIMAL(10,2),
  team2_highest_score DECIMAL(10,2),
  last_matchup_date DATE,
  playoff_matchups INTEGER DEFAULT 0,
  championship_matchups INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CHECK (team1_id < team2_id) -- Ensure consistent ordering
);

-- Create unique constraint and indexes
CREATE UNIQUE INDEX idx_h2h_unique ON head_to_head_records(league_id, team1_id, team2_id);
CREATE INDEX idx_h2h_league ON head_to_head_records(league_id);
CREATE INDEX idx_h2h_team1 ON head_to_head_records(team1_id);
CREATE INDEX idx_h2h_team2 ON head_to_head_records(team2_id);

-- Performance trends tracking
CREATE TABLE performance_trends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL, -- 'TEAM' or 'PLAYER'
  entity_id VARCHAR(255) NOT NULL,
  period_type VARCHAR(50) NOT NULL, -- 'WEEKLY', 'MONTHLY', 'SEASONAL'
  period_value VARCHAR(50) NOT NULL,
  metrics JSONB NOT NULL,
  trend_direction VARCHAR(20), -- 'UP', 'DOWN', 'STABLE'
  trend_strength DECIMAL(5,2), -- Percentage change
  calculated_at TIMESTAMP DEFAULT NOW()
);

-- Create unique constraint and indexes
CREATE UNIQUE INDEX idx_trends_unique ON performance_trends(league_id, entity_type, entity_id, period_type, period_value);
CREATE INDEX idx_trends_league ON performance_trends(league_id);
CREATE INDEX idx_trends_entity ON performance_trends(entity_type, entity_id);
CREATE INDEX idx_trends_calculated ON performance_trends(calculated_at);

-- Championship history records
CREATE TABLE championship_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season VARCHAR(50) NOT NULL,
  champion_id VARCHAR(255) NOT NULL,
  runner_up_id VARCHAR(255),
  third_place_id VARCHAR(255),
  regular_season_winner_id VARCHAR(255),
  championship_score DECIMAL(10,2),
  runner_up_score DECIMAL(10,2),
  playoff_bracket JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create unique constraint and indexes
CREATE UNIQUE INDEX idx_championships_unique ON championship_records(league_id, season);
CREATE INDEX idx_championships_league ON championship_records(league_id);
CREATE INDEX idx_championships_champion ON championship_records(champion_id);

-- Statistics calculation log for tracking and debugging
CREATE TABLE statistics_calculations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  calculation_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'PENDING',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  records_processed INTEGER DEFAULT 0,
  execution_time_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for calculation log
CREATE INDEX idx_calc_league ON statistics_calculations(league_id);
CREATE INDEX idx_calc_status ON statistics_calculations(status);
CREATE INDEX idx_calc_created ON statistics_calculations(created_at);

-- Season statistics table (denormalized for performance)
CREATE TABLE season_statistics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season VARCHAR(50) NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  ties INTEGER DEFAULT 0,
  points_for DECIMAL(10,2) DEFAULT 0,
  points_against DECIMAL(10,2) DEFAULT 0,
  avg_points_for DECIMAL(10,2),
  avg_points_against DECIMAL(10,2),
  highest_score DECIMAL(10,2),
  lowest_score DECIMAL(10,2),
  points_std_dev DECIMAL(10,2),
  longest_win_streak INTEGER DEFAULT 0,
  longest_loss_streak INTEGER DEFAULT 0,
  current_streak_type VARCHAR(10),
  current_streak_count INTEGER DEFAULT 0,
  playoff_appearance BOOLEAN DEFAULT FALSE,
  championship_appearance BOOLEAN DEFAULT FALSE,
  division_winner BOOLEAN DEFAULT FALSE,
  calculated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for season statistics
CREATE UNIQUE INDEX idx_season_stats_unique ON season_statistics(league_id, season, team_id);
CREATE INDEX idx_season_stats_league ON season_statistics(league_id);
CREATE INDEX idx_season_stats_season ON season_statistics(season);
CREATE INDEX idx_season_stats_team ON season_statistics(team_id);

-- Weekly statistics for granular tracking
CREATE TABLE weekly_statistics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  season VARCHAR(50) NOT NULL,
  week INTEGER NOT NULL,
  team_id VARCHAR(255) NOT NULL,
  opponent_id VARCHAR(255),
  points_for DECIMAL(10,2) NOT NULL,
  points_against DECIMAL(10,2),
  result VARCHAR(10), -- 'WIN', 'LOSS', 'TIE'
  is_playoff BOOLEAN DEFAULT FALSE,
  is_championship BOOLEAN DEFAULT FALSE,
  margin_of_victory DECIMAL(10,2),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for weekly statistics
CREATE UNIQUE INDEX idx_weekly_stats_unique ON weekly_statistics(league_id, season, week, team_id);
CREATE INDEX idx_weekly_stats_league ON weekly_statistics(league_id);
CREATE INDEX idx_weekly_stats_season ON weekly_statistics(season, week);
CREATE INDEX idx_weekly_stats_team ON weekly_statistics(team_id);

-- Create materialized view for fast season statistics queries
CREATE MATERIALIZED VIEW mv_season_statistics AS
SELECT 
  ws.league_id,
  ws.season,
  ws.team_id,
  COUNT(*) as games_played,
  COUNT(*) FILTER (WHERE ws.result = 'WIN') as wins,
  COUNT(*) FILTER (WHERE ws.result = 'LOSS') as losses,
  COUNT(*) FILTER (WHERE ws.result = 'TIE') as ties,
  SUM(ws.points_for) as total_points_for,
  SUM(ws.points_against) as total_points_against,
  AVG(ws.points_for) as avg_points_for,
  AVG(ws.points_against) as avg_points_against,
  MAX(ws.points_for) as highest_score,
  MIN(ws.points_for) as lowest_score,
  STDDEV(ws.points_for) as points_std_dev,
  MAX(ws.margin_of_victory) as biggest_win,
  MIN(ws.margin_of_victory) as biggest_loss,
  COUNT(*) FILTER (WHERE ws.is_playoff = true) as playoff_games,
  COUNT(*) FILTER (WHERE ws.is_championship = true) as championship_games,
  NOW() as calculated_at
FROM weekly_statistics ws
GROUP BY ws.league_id, ws.season, ws.team_id
WITH DATA;

-- Create indexes on materialized view
CREATE INDEX idx_mv_season_stats_lookup ON mv_season_statistics(league_id, season, team_id);
CREATE INDEX idx_mv_season_stats_league ON mv_season_statistics(league_id);

-- Create materialized view for head-to-head summary
CREATE MATERIALIZED VIEW mv_h2h_summary AS
SELECT 
  h.league_id,
  h.team1_id,
  h.team2_id,
  h.total_matchups,
  h.team1_wins,
  h.team2_wins,
  h.ties,
  CASE 
    WHEN h.total_matchups > 0 THEN ROUND((h.team1_wins::numeric / h.total_matchups) * 100, 2)
    ELSE 0
  END as team1_win_percentage,
  CASE 
    WHEN h.total_matchups > 0 THEN ROUND((h.team2_wins::numeric / h.total_matchups) * 100, 2)
    ELSE 0
  END as team2_win_percentage,
  CASE 
    WHEN h.total_matchups > 0 THEN ROUND(h.team1_total_points / h.total_matchups, 2)
    ELSE 0
  END as team1_avg_points,
  CASE 
    WHEN h.total_matchups > 0 THEN ROUND(h.team2_total_points / h.total_matchups, 2)
    ELSE 0
  END as team2_avg_points,
  h.playoff_matchups,
  h.championship_matchups,
  h.last_matchup_date
FROM head_to_head_records h
WITH DATA;

-- Create indexes on head-to-head materialized view
CREATE INDEX idx_mv_h2h_lookup ON mv_h2h_summary(league_id, team1_id, team2_id);

-- Function to refresh all materialized views
CREATE OR REPLACE FUNCTION refresh_statistics_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_season_statistics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_h2h_summary;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic updates
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add update triggers to tables with updated_at
CREATE TRIGGER update_all_time_records_timestamp BEFORE UPDATE ON all_time_records
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_h2h_records_timestamp BEFORE UPDATE ON head_to_head_records
  FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Add comments for documentation
COMMENT ON TABLE all_time_records IS 'Tracks all-time records for leagues including highest scores, longest streaks, etc.';
COMMENT ON TABLE head_to_head_records IS 'Stores historical matchup data between teams';
COMMENT ON TABLE performance_trends IS 'Tracks performance trends over different time periods';
COMMENT ON TABLE championship_records IS 'Historical championship and playoff results';
COMMENT ON TABLE statistics_calculations IS 'Log of statistics calculation jobs for monitoring and debugging';
COMMENT ON TABLE season_statistics IS 'Denormalized season-level statistics for fast queries';
COMMENT ON TABLE weekly_statistics IS 'Granular weekly game statistics';
COMMENT ON MATERIALIZED VIEW mv_season_statistics IS 'Aggregated season statistics for performance';
COMMENT ON MATERIALIZED VIEW mv_h2h_summary IS 'Summarized head-to-head records with calculated percentages';