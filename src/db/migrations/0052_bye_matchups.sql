ALTER TYPE statistics_result ADD VALUE IF NOT EXISTS 'bye';

ALTER TABLE fantasy_matchups
  ALTER COLUMN away_team_provider_id DROP NOT NULL;
