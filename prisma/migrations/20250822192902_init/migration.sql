-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "public"."member_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."agent_type" AS ENUM ('COMMISSIONER', 'ANALYST', 'NARRATOR', 'TRASH_TALKER', 'BETTING_ADVISOR');

-- CreateEnum
CREATE TYPE "public"."memory_type" AS ENUM ('SHORT_TERM', 'LONG_TERM', 'EPISODIC', 'SEMANTIC');

-- CreateEnum
CREATE TYPE "public"."import_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED');

-- CreateEnum
CREATE TYPE "public"."mapping_method" AS ENUM ('AUTOMATIC', 'MANUAL', 'FUZZY_MATCH');

-- CreateEnum
CREATE TYPE "public"."entity_type" AS ENUM ('PLAYER', 'TEAM');

-- CreateEnum
CREATE TYPE "public"."audit_action" AS ENUM ('CREATE', 'MERGE', 'SPLIT', 'UPDATE', 'DELETE', 'ROLLBACK');

-- CreateEnum
CREATE TYPE "public"."market_type" AS ENUM ('H2H', 'SPREADS', 'TOTALS');

-- CreateEnum
CREATE TYPE "public"."prop_type" AS ENUM ('PASS_TDS', 'PASS_YDS', 'RUSH_YDS', 'RUSH_TDS', 'REC_YDS', 'REC_TDS', 'RECEPTIONS', 'TACKLES', 'SACKS', 'INTERCEPTIONS');

-- CreateEnum
CREATE TYPE "public"."chat_message_type" AS ENUM ('USER', 'AGENT', 'SYSTEM', 'COMMAND', 'NOTIFICATION');

-- CreateEnum
CREATE TYPE "public"."content_type" AS ENUM ('WEEKLY_RECAP', 'POWER_RANKINGS', 'MATCHUP_PREVIEW', 'TRADE_ANALYSIS', 'INJURY_REPORT', 'SEASON_NARRATIVE', 'PLAYOFF_PREVIEW', 'CHAMPIONSHIP_RECAP', 'DRAFT_ANALYSIS', 'WAIVER_WIRE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."content_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'NEEDS_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."bet_type" AS ENUM ('STRAIGHT', 'PARLAY');

-- CreateEnum
CREATE TYPE "public"."bet_status" AS ENUM ('PENDING', 'LIVE', 'WON', 'LOST', 'PUSH', 'CANCELLED', 'VOID');

-- CreateEnum
CREATE TYPE "public"."bet_result" AS ENUM ('WIN', 'LOSS', 'PUSH', 'VOID');

-- CreateEnum
CREATE TYPE "public"."bet_slip_type" AS ENUM ('SINGLE', 'PARLAY', 'ROUND_ROBIN');

-- CreateEnum
CREATE TYPE "public"."bankroll_status" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."competition_type" AS ENUM ('WEEKLY', 'SEASON', 'TOURNAMENT', 'CUSTOM');

-- CreateEnum
CREATE TYPE "public"."competition_scope" AS ENUM ('LEAGUE', 'PLATFORM');

-- CreateEnum
CREATE TYPE "public"."competition_status" AS ENUM ('PENDING', 'ACTIVE', 'SETTLING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."achievement_type" AS ENUM ('COMPETITION_WIN', 'COMPETITION_PLACE', 'WEEKLY_BEST', 'PERFECT_WEEK', 'STREAK_MASTER', 'ROI_CHAMPION', 'PARTICIPATION', 'BETTING_MILESTONE');

-- CreateEnum
CREATE TYPE "public"."reward_type" AS ENUM ('UNITS', 'BADGE', 'TITLE', 'MULTIPLIER');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255),
    "avatar_url" TEXT,
    "password" VARCHAR(255),
    "email_verified" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leagues" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "espn_league_id" BIGINT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "season" INTEGER NOT NULL,
    "sandbox_namespace" VARCHAR(100) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leagues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_members" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "espn_team_id" INTEGER,
    "team_name" VARCHAR(255),
    "role" "public"."member_role" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."espn_credentials" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "encrypted_swid" TEXT NOT NULL,
    "encrypted_espn_s2" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3),
    "last_validated" TIMESTAMP(3),
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "espn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_players" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "espn_player_id" BIGINT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "position" VARCHAR(10),
    "nfl_team" VARCHAR(10),
    "stats" JSONB NOT NULL DEFAULT '{}',
    "projections" JSONB NOT NULL DEFAULT '{}',
    "embeddings" vector(1536),
    "image_url" TEXT,
    "injury_status" VARCHAR(50),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_teams" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "espn_team_id" INTEGER NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "abbreviation" VARCHAR(10),
    "logo_url" TEXT,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "points_for" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "points_against" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "standing" INTEGER,
    "playoff_seed" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_roster_spots" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "slot_position" VARCHAR(20) NOT NULL,
    "week" INTEGER NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "league_roster_spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_matchups" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "week" INTEGER NOT NULL,
    "matchup_period" INTEGER NOT NULL,
    "home_team_id" UUID NOT NULL,
    "away_team_id" UUID NOT NULL,
    "home_score" DOUBLE PRECISION,
    "away_score" DOUBLE PRECISION,
    "is_playoffs" BOOLEAN NOT NULL DEFAULT false,
    "is_complete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "league_matchups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_agent_memory" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "agent_type" "public"."agent_type" NOT NULL,
    "memory_type" "public"."memory_type" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embeddings" vector(1536),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "league_agent_memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_historical_data" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" VARCHAR(50) NOT NULL,
    "data" JSONB NOT NULL,
    "data_hash" VARCHAR(64) NOT NULL,
    "record_count" INTEGER NOT NULL,
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_historical_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."import_checkpoints" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "import_id" VARCHAR(255) NOT NULL,
    "league_id" UUID NOT NULL,
    "processed_items" INTEGER NOT NULL,
    "total_items" INTEGER NOT NULL,
    "current_season" INTEGER,
    "current_week" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" "public"."import_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_archives" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "season" INTEGER NOT NULL,
    "data_type" VARCHAR(50) NOT NULL,
    "compressed_data" BYTEA NOT NULL,
    "original_size" INTEGER NOT NULL,
    "compressed_size" INTEGER NOT NULL,
    "compression_ratio" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "league_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sync_metadata" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "last_synced_week" INTEGER,
    "last_synced_season" INTEGER,
    "total_seasons" INTEGER NOT NULL DEFAULT 0,
    "total_matchups" INTEGER NOT NULL DEFAULT 0,
    "total_players" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_transactions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "transaction_id" BIGINT NOT NULL,
    "season" INTEGER NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "team_id" INTEGER,
    "player_id" BIGINT,
    "bid_amount" INTEGER,
    "transaction_date" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "league_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."league_player_stats" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "player_id" BIGINT NOT NULL,
    "season" INTEGER NOT NULL,
    "week" INTEGER,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projected_points" DOUBLE PRECISION,
    "stats" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "league_player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player_identities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "master_player_id" UUID NOT NULL,
    "canonical_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 1.00,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "player_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player_identity_mappings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "master_player_id" UUID NOT NULL,
    "espn_player_id" BIGINT NOT NULL,
    "season" INTEGER NOT NULL,
    "name_variation" VARCHAR(255) NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "mapping_method" "public"."mapping_method" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "player_identity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_identities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "master_team_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "canonical_name" VARCHAR(255) NOT NULL,
    "owner_history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."team_identity_mappings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "master_team_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "espn_team_id" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "team_name" VARCHAR(255) NOT NULL,
    "owner_name" VARCHAR(255),
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_identity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."identity_audit_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "entity_type" "public"."entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "public"."audit_action" NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "reason" TEXT,
    "performed_by" UUID,
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."all_time_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "record_type" VARCHAR(100) NOT NULL,
    "record_holder_type" VARCHAR(50) NOT NULL,
    "record_holder_id" VARCHAR(255) NOT NULL,
    "record_value" DECIMAL(10,2) NOT NULL,
    "season" VARCHAR(50),
    "week" INTEGER,
    "opponent_id" VARCHAR(255),
    "date_achieved" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "previous_record_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "all_time_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."head_to_head_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "team1_id" VARCHAR(255) NOT NULL,
    "team2_id" VARCHAR(255) NOT NULL,
    "total_matchups" INTEGER NOT NULL DEFAULT 0,
    "team1_wins" INTEGER NOT NULL DEFAULT 0,
    "team2_wins" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "team1_total_points" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "team2_total_points" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "team1_highest_score" DECIMAL(10,2),
    "team2_highest_score" DECIMAL(10,2),
    "last_matchup_date" TIMESTAMP(3),
    "playoff_matchups" INTEGER NOT NULL DEFAULT 0,
    "championship_matchups" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "head_to_head_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."performance_trends" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(255) NOT NULL,
    "period_type" VARCHAR(50) NOT NULL,
    "period_value" VARCHAR(50) NOT NULL,
    "metrics" JSONB NOT NULL,
    "trend_direction" VARCHAR(20),
    "trend_strength" DECIMAL(5,2),
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "performance_trends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."championship_records" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "season" VARCHAR(50) NOT NULL,
    "champion_id" VARCHAR(255) NOT NULL,
    "runner_up_id" VARCHAR(255),
    "third_place_id" VARCHAR(255),
    "regular_season_winner_id" VARCHAR(255),
    "championship_score" DECIMAL(10,2),
    "runner_up_score" DECIMAL(10,2),
    "playoff_bracket" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "championship_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."statistics_calculations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "calculation_type" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "error_message" TEXT,
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "execution_time_ms" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statistics_calculations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."season_statistics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "season" VARCHAR(50) NOT NULL,
    "team_id" VARCHAR(255) NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "ties" INTEGER NOT NULL DEFAULT 0,
    "points_for" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "points_against" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avg_points_for" DECIMAL(10,2),
    "avg_points_against" DECIMAL(10,2),
    "highest_score" DECIMAL(10,2),
    "lowest_score" DECIMAL(10,2),
    "points_std_dev" DECIMAL(10,2),
    "longest_win_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_loss_streak" INTEGER NOT NULL DEFAULT 0,
    "current_streak_type" VARCHAR(10),
    "current_streak_count" INTEGER NOT NULL DEFAULT 0,
    "playoff_appearance" BOOLEAN NOT NULL DEFAULT false,
    "championship_appearance" BOOLEAN NOT NULL DEFAULT false,
    "division_winner" BOOLEAN NOT NULL DEFAULT false,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "season_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."weekly_statistics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "season" VARCHAR(50) NOT NULL,
    "week" INTEGER NOT NULL,
    "team_id" VARCHAR(255) NOT NULL,
    "opponent_id" VARCHAR(255),
    "points_for" DECIMAL(10,2) NOT NULL,
    "points_against" DECIMAL(10,2),
    "result" VARCHAR(10),
    "is_playoff" BOOLEAN NOT NULL DEFAULT false,
    "is_championship" BOOLEAN NOT NULL DEFAULT false,
    "margin_of_victory" DECIMAL(10,2),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_statistics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assigned_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "public"."role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "public"."league_settings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_sandbox" VARCHAR(255) NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "features" JSONB NOT NULL DEFAULT '{"espn": true, "ai_content": false, "betting": false}',
    "sync_config" JSONB NOT NULL DEFAULT '{"auto_sync": true, "sync_interval": 3600}',
    "notification_config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "league_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_config" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "key" VARCHAR(255) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "category" VARCHAR(100),
    "is_secret" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" UUID,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100),
    "entity_id" VARCHAR(255),
    "old_value" JSONB,
    "new_value" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."system_metrics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "metric_type" VARCHAR(100) NOT NULL,
    "metric_name" VARCHAR(255) NOT NULL,
    "value" DECIMAL(20,4) NOT NULL,
    "unit" VARCHAR(50),
    "tags" JSONB NOT NULL DEFAULT '{}',
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sync_status" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_sandbox" VARCHAR(255) NOT NULL,
    "sync_type" VARCHAR(100) NOT NULL,
    "status" VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invitations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_sandbox" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL DEFAULT 'MEMBER',
    "token" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."agent_memories" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "agent_id" VARCHAR(255) NOT NULL,
    "league_sandbox" VARCHAR(255),
    "content" TEXT NOT NULL,
    "embedding" vector(1536),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "importance" REAL NOT NULL DEFAULT 0.5,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accessed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "access_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."agent_conversations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "session_id" VARCHAR(255) NOT NULL,
    "user_id" UUID,
    "agent_id" VARCHAR(255) NOT NULL,
    "league_sandbox" VARCHAR(255),
    "messages" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "socket_id" VARCHAR(255),
    "is_streaming" BOOLEAN NOT NULL DEFAULT false,
    "last_token" TEXT,
    "stream_metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."agent_configs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "agent_id" VARCHAR(255) NOT NULL,
    "agent_type" "public"."agent_type" NOT NULL,
    "league_sandbox" VARCHAR(255),
    "personality" JSONB NOT NULL,
    "tools" JSONB NOT NULL DEFAULT '[]',
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."generated_content" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "type" "public"."content_type" NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "agent_id" VARCHAR(255) NOT NULL,
    "agent_type" "public"."agent_type",
    "status" "public"."content_status" NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "review_data" JSONB,
    "published_id" UUID,
    "schedule_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "generated_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."blog_posts" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "slug" VARCHAR(500) NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "author_type" VARCHAR(50) NOT NULL,
    "author_id" VARCHAR(255) NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."content_schedules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "public"."content_type" NOT NULL,
    "agent_type" "public"."agent_type" NOT NULL,
    "cron_expression" VARCHAR(100) NOT NULL,
    "template_id" UUID,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."content_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "public"."content_type" NOT NULL,
    "prompt" TEXT NOT NULL,
    "structure" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "is_global" BOOLEAN NOT NULL DEFAULT false,
    "league_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "session_id" VARCHAR(255) NOT NULL,
    "conversation_id" VARCHAR(255),
    "sender_id" VARCHAR(255) NOT NULL,
    "sender_type" "public"."chat_message_type" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reply_to_id" UUID,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "edited_at" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."chat_sessions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "session_id" VARCHAR(255) NOT NULL,
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "title" VARCHAR(255),
    "participants" JSONB NOT NULL DEFAULT '[]',
    "activeAgents" JSONB NOT NULL DEFAULT '[]',
    "context" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_activity_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."agent_summons" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "session_id" VARCHAR(255) NOT NULL,
    "agent_id" VARCHAR(255) NOT NULL,
    "agent_type" "public"."agent_type" NOT NULL,
    "summoned_by" UUID NOT NULL,
    "reason" TEXT,
    "intro_message" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "tools_used" JSONB NOT NULL DEFAULT '[]',
    "summoned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed_at" TIMESTAMP(3),

    CONSTRAINT "agent_summons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."odds_snapshots" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "sport" VARCHAR(50) NOT NULL,
    "game_id" VARCHAR(100),
    "event_id" VARCHAR(100),
    "home_team" VARCHAR(100),
    "away_team" VARCHAR(100),
    "commence_time" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odds_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."betting_lines" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "game_id" VARCHAR(100) NOT NULL,
    "bookmaker" VARCHAR(50) NOT NULL,
    "market_type" "public"."market_type" NOT NULL,
    "line_value" DECIMAL(10,2),
    "odds_value" INTEGER,
    "team" VARCHAR(100),
    "is_home" BOOLEAN,
    "implied_probability" DECIMAL(5,4),
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "betting_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."odds_movements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "game_id" VARCHAR(100) NOT NULL,
    "bookmaker" VARCHAR(50) NOT NULL,
    "market_type" "public"."market_type" NOT NULL,
    "team" VARCHAR(100),
    "opening_line" DECIMAL(10,2),
    "opening_odds" INTEGER,
    "current_line" DECIMAL(10,2),
    "current_odds" INTEGER,
    "line_movement" DECIMAL(10,2),
    "odds_movement" INTEGER,
    "movement_count" INTEGER NOT NULL DEFAULT 0,
    "last_movement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odds_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."player_props" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "game_id" VARCHAR(100) NOT NULL,
    "player_id" VARCHAR(100) NOT NULL,
    "player_name" VARCHAR(255) NOT NULL,
    "prop_type" "public"."prop_type" NOT NULL,
    "line" DECIMAL(10,2) NOT NULL,
    "over_odds" INTEGER,
    "under_odds" INTEGER,
    "bookmaker" VARCHAR(50) NOT NULL,
    "last_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "player_props_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bankrolls" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "week" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "starting_balance" DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
    "current_balance" DECIMAL(10,2) NOT NULL,
    "total_bets" INTEGER NOT NULL DEFAULT 0,
    "pending_bets" INTEGER NOT NULL DEFAULT 0,
    "won_bets" INTEGER NOT NULL DEFAULT 0,
    "lost_bets" INTEGER NOT NULL DEFAULT 0,
    "total_wagered" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "total_won" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "total_lost" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "profit_loss" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "roi" DECIMAL(5,2),
    "status" "public"."bankroll_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bankrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bets" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "bankroll_id" UUID NOT NULL,
    "bet_slip_id" UUID,
    "game_id" VARCHAR(100) NOT NULL,
    "event_date" TIMESTAMP(3) NOT NULL,
    "bet_type" "public"."bet_type" NOT NULL,
    "market_type" "public"."market_type" NOT NULL,
    "selection" VARCHAR(255) NOT NULL,
    "line" DECIMAL(10,2),
    "odds" INTEGER NOT NULL,
    "stake" DECIMAL(10,2) NOT NULL,
    "potential_payout" DECIMAL(10,2) NOT NULL,
    "actual_payout" DECIMAL(10,2),
    "status" "public"."bet_status" NOT NULL DEFAULT 'PENDING',
    "result" "public"."bet_result",
    "settled_at" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bet_slips" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "type" "public"."bet_slip_type" NOT NULL DEFAULT 'SINGLE',
    "total_stake" DECIMAL(10,2) NOT NULL,
    "total_odds" INTEGER NOT NULL,
    "potential_payout" DECIMAL(10,2) NOT NULL,
    "actual_payout" DECIMAL(10,2),
    "status" "public"."bet_status" NOT NULL DEFAULT 'PENDING',
    "result" "public"."bet_result",
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bet_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."settlements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "bet_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "league_sandbox" VARCHAR(255) NOT NULL,
    "game_id" VARCHAR(100) NOT NULL,
    "bet_amount" DECIMAL(10,2) NOT NULL,
    "payout_amount" DECIMAL(10,2) NOT NULL,
    "result" "public"."bet_result" NOT NULL,
    "game_score" JSONB NOT NULL,
    "settled_by" VARCHAR(50),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."competitions" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "public"."competition_type" NOT NULL,
    "scope" "public"."competition_scope" NOT NULL,
    "league_id" UUID,
    "league_sandbox" VARCHAR(255),
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "week" INTEGER,
    "season" INTEGER,
    "entry_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "prize_pool" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "max_entrants" INTEGER,
    "min_entrants" INTEGER NOT NULL DEFAULT 2,
    "scoring_rules" JSONB NOT NULL,
    "status" "public"."competition_status" NOT NULL DEFAULT 'PENDING',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."competition_entries" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "competition_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rank" INTEGER,
    "score" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "profit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "roi" DECIMAL(10,4),
    "win_rate" DECIMAL(5,2),
    "total_bets" INTEGER NOT NULL DEFAULT 0,
    "won_bets" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB,
    "last_update" TIMESTAMP(3),

    CONSTRAINT "competition_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."leaderboards" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "competition_id" UUID NOT NULL,
    "standings" JSONB NOT NULL,
    "last_calculated" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "calculated_by" VARCHAR(50),

    CONSTRAINT "leaderboards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."achievements" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "league_id" UUID,
    "type" "public"."achievement_type" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "icon" VARCHAR(255),
    "metadata" JSONB,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER,
    "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."competition_rewards" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "competition_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "placement" INTEGER NOT NULL,
    "reward_type" "public"."reward_type" NOT NULL,
    "reward_value" JSONB NOT NULL,
    "claimed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "competition_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_espn_league_id_key" ON "public"."leagues"("espn_league_id");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_sandbox_namespace_key" ON "public"."leagues"("sandbox_namespace");

-- CreateIndex
CREATE INDEX "leagues_sandbox_namespace_idx" ON "public"."leagues"("sandbox_namespace");

-- CreateIndex
CREATE INDEX "leagues_espn_league_id_idx" ON "public"."leagues"("espn_league_id");

-- CreateIndex
CREATE UNIQUE INDEX "leagues_espn_league_id_season_key" ON "public"."leagues"("espn_league_id", "season");

-- CreateIndex
CREATE INDEX "league_members_user_id_idx" ON "public"."league_members"("user_id");

-- CreateIndex
CREATE INDEX "league_members_league_id_idx" ON "public"."league_members"("league_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_members_league_id_user_id_key" ON "public"."league_members"("league_id", "user_id");

-- CreateIndex
CREATE INDEX "espn_credentials_league_id_idx" ON "public"."espn_credentials"("league_id");

-- CreateIndex
CREATE UNIQUE INDEX "espn_credentials_user_id_league_id_key" ON "public"."espn_credentials"("user_id", "league_id");

-- CreateIndex
CREATE INDEX "league_players_league_id_idx" ON "public"."league_players"("league_id");

-- CreateIndex
CREATE INDEX "league_players_espn_player_id_idx" ON "public"."league_players"("espn_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_players_league_id_espn_player_id_key" ON "public"."league_players"("league_id", "espn_player_id");

-- CreateIndex
CREATE INDEX "league_teams_league_id_idx" ON "public"."league_teams"("league_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_teams_league_id_espn_team_id_key" ON "public"."league_teams"("league_id", "espn_team_id");

-- CreateIndex
CREATE INDEX "league_roster_spots_team_id_idx" ON "public"."league_roster_spots"("team_id");

-- CreateIndex
CREATE INDEX "league_roster_spots_player_id_idx" ON "public"."league_roster_spots"("player_id");

-- CreateIndex
CREATE UNIQUE INDEX "league_roster_spots_team_id_player_id_week_key" ON "public"."league_roster_spots"("team_id", "player_id", "week");

-- CreateIndex
CREATE INDEX "league_matchups_league_id_week_idx" ON "public"."league_matchups"("league_id", "week");

-- CreateIndex
CREATE UNIQUE INDEX "league_matchups_league_id_week_home_team_id_away_team_id_key" ON "public"."league_matchups"("league_id", "week", "home_team_id", "away_team_id");

-- CreateIndex
CREATE INDEX "league_agent_memory_league_id_agent_type_idx" ON "public"."league_agent_memory"("league_id", "agent_type");

-- CreateIndex
CREATE INDEX "league_agent_memory_created_at_idx" ON "public"."league_agent_memory"("created_at");

-- CreateIndex
CREATE INDEX "league_historical_data_league_id_season_idx" ON "public"."league_historical_data"("league_id", "season");

-- CreateIndex
CREATE INDEX "league_historical_data_data_hash_idx" ON "public"."league_historical_data"("data_hash");

-- CreateIndex
CREATE UNIQUE INDEX "league_historical_data_league_id_season_data_type_key" ON "public"."league_historical_data"("league_id", "season", "data_type");

-- CreateIndex
CREATE INDEX "import_checkpoints_import_id_idx" ON "public"."import_checkpoints"("import_id");

-- CreateIndex
CREATE INDEX "import_checkpoints_league_id_idx" ON "public"."import_checkpoints"("league_id");

-- CreateIndex
CREATE INDEX "league_archives_league_id_season_idx" ON "public"."league_archives"("league_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "league_archives_league_id_season_data_type_key" ON "public"."league_archives"("league_id", "season", "data_type");

-- CreateIndex
CREATE UNIQUE INDEX "sync_metadata_league_id_key" ON "public"."sync_metadata"("league_id");

-- CreateIndex
CREATE INDEX "league_transactions_league_id_season_idx" ON "public"."league_transactions"("league_id", "season");

-- CreateIndex
CREATE INDEX "league_transactions_transaction_date_idx" ON "public"."league_transactions"("transaction_date");

-- CreateIndex
CREATE UNIQUE INDEX "league_transactions_league_id_transaction_id_season_key" ON "public"."league_transactions"("league_id", "transaction_id", "season");

-- CreateIndex
CREATE INDEX "league_player_stats_league_id_season_idx" ON "public"."league_player_stats"("league_id", "season");

-- CreateIndex
CREATE INDEX "league_player_stats_player_id_season_idx" ON "public"."league_player_stats"("player_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "league_player_stats_league_id_player_id_season_week_key" ON "public"."league_player_stats"("league_id", "player_id", "season", "week");

-- CreateIndex
CREATE UNIQUE INDEX "player_identities_master_player_id_key" ON "public"."player_identities"("master_player_id");

-- CreateIndex
CREATE INDEX "player_identity_mappings_master_player_id_idx" ON "public"."player_identity_mappings"("master_player_id");

-- CreateIndex
CREATE INDEX "player_identity_mappings_espn_player_id_idx" ON "public"."player_identity_mappings"("espn_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_identity_mappings_espn_player_id_season_key" ON "public"."player_identity_mappings"("espn_player_id", "season");

-- CreateIndex
CREATE UNIQUE INDEX "team_identities_master_team_id_key" ON "public"."team_identities"("master_team_id");

-- CreateIndex
CREATE INDEX "team_identities_league_id_idx" ON "public"."team_identities"("league_id");

-- CreateIndex
CREATE INDEX "team_identity_mappings_master_team_id_idx" ON "public"."team_identity_mappings"("master_team_id");

-- CreateIndex
CREATE INDEX "team_identity_mappings_league_id_idx" ON "public"."team_identity_mappings"("league_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_identity_mappings_league_id_espn_team_id_season_key" ON "public"."team_identity_mappings"("league_id", "espn_team_id", "season");

-- CreateIndex
CREATE INDEX "identity_audit_log_entity_type_entity_id_idx" ON "public"."identity_audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "identity_audit_log_performed_by_idx" ON "public"."identity_audit_log"("performed_by");

-- CreateIndex
CREATE INDEX "idx_all_time_records_league" ON "public"."all_time_records"("league_id");

-- CreateIndex
CREATE INDEX "idx_all_time_records_type" ON "public"."all_time_records"("record_type");

-- CreateIndex
CREATE UNIQUE INDEX "idx_all_time_records_unique" ON "public"."all_time_records"("league_id", "record_type", "record_holder_type");

-- CreateIndex
CREATE INDEX "idx_h2h_league" ON "public"."head_to_head_records"("league_id");

-- CreateIndex
CREATE INDEX "idx_h2h_team1" ON "public"."head_to_head_records"("team1_id");

-- CreateIndex
CREATE INDEX "idx_h2h_team2" ON "public"."head_to_head_records"("team2_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_h2h_unique" ON "public"."head_to_head_records"("league_id", "team1_id", "team2_id");

-- CreateIndex
CREATE INDEX "idx_trends_league" ON "public"."performance_trends"("league_id");

-- CreateIndex
CREATE INDEX "idx_trends_entity" ON "public"."performance_trends"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_trends_calculated" ON "public"."performance_trends"("calculated_at");

-- CreateIndex
CREATE UNIQUE INDEX "idx_trends_unique" ON "public"."performance_trends"("league_id", "entity_type", "entity_id", "period_type", "period_value");

-- CreateIndex
CREATE INDEX "idx_championships_league" ON "public"."championship_records"("league_id");

-- CreateIndex
CREATE INDEX "idx_championships_champion" ON "public"."championship_records"("champion_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_championships_unique" ON "public"."championship_records"("league_id", "season");

-- CreateIndex
CREATE INDEX "idx_calc_league" ON "public"."statistics_calculations"("league_id");

-- CreateIndex
CREATE INDEX "idx_calc_status" ON "public"."statistics_calculations"("status");

-- CreateIndex
CREATE INDEX "idx_calc_created" ON "public"."statistics_calculations"("created_at");

-- CreateIndex
CREATE INDEX "idx_season_stats_league" ON "public"."season_statistics"("league_id");

-- CreateIndex
CREATE INDEX "idx_season_stats_season" ON "public"."season_statistics"("season");

-- CreateIndex
CREATE INDEX "idx_season_stats_team" ON "public"."season_statistics"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_season_stats_unique" ON "public"."season_statistics"("league_id", "season", "team_id");

-- CreateIndex
CREATE INDEX "idx_weekly_stats_league" ON "public"."weekly_statistics"("league_id");

-- CreateIndex
CREATE INDEX "idx_weekly_stats_season" ON "public"."weekly_statistics"("season", "week");

-- CreateIndex
CREATE INDEX "idx_weekly_stats_team" ON "public"."weekly_statistics"("team_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_weekly_stats_unique" ON "public"."weekly_statistics"("league_id", "season", "week", "team_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "public"."roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "public"."permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "league_settings_league_sandbox_key" ON "public"."league_settings"("league_sandbox");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "public"."system_config"("key");

-- CreateIndex
CREATE INDEX "idx_audit_logs_user" ON "public"."audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_entity" ON "public"."audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created" ON "public"."audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "idx_system_metrics_lookup" ON "public"."system_metrics"("metric_type", "metric_name", "recorded_at");

-- CreateIndex
CREATE INDEX "idx_sync_status_lookup" ON "public"."sync_status"("league_sandbox", "sync_type", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_key" ON "public"."invitations"("token");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_league_sandbox_email_key" ON "public"."invitations"("league_sandbox", "email");

-- CreateIndex
CREATE INDEX "agent_memories_agent_id_league_sandbox_idx" ON "public"."agent_memories"("agent_id", "league_sandbox");

-- CreateIndex
CREATE INDEX "agent_memories_created_at_idx" ON "public"."agent_memories"("created_at");

-- CreateIndex
CREATE INDEX "agent_conversations_session_id_agent_id_idx" ON "public"."agent_conversations"("session_id", "agent_id");

-- CreateIndex
CREATE INDEX "agent_conversations_user_id_created_at_idx" ON "public"."agent_conversations"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_conversations_socket_id_idx" ON "public"."agent_conversations"("socket_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_agent_id_key" ON "public"."agent_configs"("agent_id");

-- CreateIndex
CREATE INDEX "agent_configs_agent_type_league_sandbox_idx" ON "public"."agent_configs"("agent_type", "league_sandbox");

-- CreateIndex
CREATE UNIQUE INDEX "agent_configs_agent_id_league_sandbox_key" ON "public"."agent_configs"("agent_id", "league_sandbox");

-- CreateIndex
CREATE INDEX "generated_content_league_id_status_idx" ON "public"."generated_content"("league_id", "status");

-- CreateIndex
CREATE INDEX "generated_content_type_status_idx" ON "public"."generated_content"("type", "status");

-- CreateIndex
CREATE INDEX "generated_content_agent_id_idx" ON "public"."generated_content"("agent_id");

-- CreateIndex
CREATE INDEX "generated_content_created_at_idx" ON "public"."generated_content"("created_at");

-- CreateIndex
CREATE INDEX "blog_posts_league_id_published_at_idx" ON "public"."blog_posts"("league_id", "published_at");

-- CreateIndex
CREATE INDEX "blog_posts_author_id_idx" ON "public"."blog_posts"("author_id");

-- CreateIndex
CREATE INDEX "blog_posts_tags_idx" ON "public"."blog_posts"("tags");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_league_id_slug_key" ON "public"."blog_posts"("league_id", "slug");

-- CreateIndex
CREATE INDEX "content_schedules_league_id_enabled_idx" ON "public"."content_schedules"("league_id", "enabled");

-- CreateIndex
CREATE INDEX "content_schedules_next_run_at_idx" ON "public"."content_schedules"("next_run_at");

-- CreateIndex
CREATE INDEX "content_templates_type_is_global_idx" ON "public"."content_templates"("type", "is_global");

-- CreateIndex
CREATE INDEX "content_templates_league_id_idx" ON "public"."content_templates"("league_id");

-- CreateIndex
CREATE INDEX "chat_messages_league_id_session_id_idx" ON "public"."chat_messages"("league_id", "session_id");

-- CreateIndex
CREATE INDEX "chat_messages_conversation_id_idx" ON "public"."chat_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "chat_messages_sender_id_sender_type_idx" ON "public"."chat_messages"("sender_id", "sender_type");

-- CreateIndex
CREATE INDEX "chat_messages_created_at_idx" ON "public"."chat_messages"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_session_id_key" ON "public"."chat_sessions"("session_id");

-- CreateIndex
CREATE INDEX "chat_sessions_league_id_started_at_idx" ON "public"."chat_sessions"("league_id", "started_at");

-- CreateIndex
CREATE INDEX "chat_sessions_last_activity_at_idx" ON "public"."chat_sessions"("last_activity_at");

-- CreateIndex
CREATE INDEX "agent_summons_agent_type_active_idx" ON "public"."agent_summons"("agent_type", "active");

-- CreateIndex
CREATE INDEX "agent_summons_summoned_at_idx" ON "public"."agent_summons"("summoned_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_summons_session_id_agent_id_key" ON "public"."agent_summons"("session_id", "agent_id");

-- CreateIndex
CREATE INDEX "odds_snapshots_sport_created_at_idx" ON "public"."odds_snapshots"("sport", "created_at" DESC);

-- CreateIndex
CREATE INDEX "odds_snapshots_game_id_idx" ON "public"."odds_snapshots"("game_id");

-- CreateIndex
CREATE INDEX "odds_snapshots_commence_time_idx" ON "public"."odds_snapshots"("commence_time");

-- CreateIndex
CREATE INDEX "betting_lines_game_id_idx" ON "public"."betting_lines"("game_id");

-- CreateIndex
CREATE INDEX "betting_lines_market_type_idx" ON "public"."betting_lines"("market_type");

-- CreateIndex
CREATE INDEX "betting_lines_bookmaker_idx" ON "public"."betting_lines"("bookmaker");

-- CreateIndex
CREATE UNIQUE INDEX "betting_lines_game_id_bookmaker_market_type_team_key" ON "public"."betting_lines"("game_id", "bookmaker", "market_type", "team");

-- CreateIndex
CREATE INDEX "odds_movements_game_id_market_type_idx" ON "public"."odds_movements"("game_id", "market_type");

-- CreateIndex
CREATE INDEX "odds_movements_last_movement_idx" ON "public"."odds_movements"("last_movement");

-- CreateIndex
CREATE UNIQUE INDEX "odds_movements_game_id_bookmaker_market_type_team_key" ON "public"."odds_movements"("game_id", "bookmaker", "market_type", "team");

-- CreateIndex
CREATE INDEX "player_props_game_id_player_id_idx" ON "public"."player_props"("game_id", "player_id");

-- CreateIndex
CREATE INDEX "player_props_prop_type_idx" ON "public"."player_props"("prop_type");

-- CreateIndex
CREATE UNIQUE INDEX "player_props_game_id_player_id_prop_type_bookmaker_key" ON "public"."player_props"("game_id", "player_id", "prop_type", "bookmaker");

-- CreateIndex
CREATE INDEX "bankrolls_user_id_league_id_idx" ON "public"."bankrolls"("user_id", "league_id");

-- CreateIndex
CREATE INDEX "bankrolls_week_season_idx" ON "public"."bankrolls"("week", "season");

-- CreateIndex
CREATE INDEX "bankrolls_status_idx" ON "public"."bankrolls"("status");

-- CreateIndex
CREATE UNIQUE INDEX "bankrolls_user_id_league_id_week_season_key" ON "public"."bankrolls"("user_id", "league_id", "week", "season");

-- CreateIndex
CREATE INDEX "bets_user_id_status_idx" ON "public"."bets"("user_id", "status");

-- CreateIndex
CREATE INDEX "bets_league_id_created_at_idx" ON "public"."bets"("league_id", "created_at");

-- CreateIndex
CREATE INDEX "bets_game_id_idx" ON "public"."bets"("game_id");

-- CreateIndex
CREATE INDEX "bets_status_event_date_idx" ON "public"."bets"("status", "event_date");

-- CreateIndex
CREATE INDEX "bets_bet_slip_id_idx" ON "public"."bets"("bet_slip_id");

-- CreateIndex
CREATE INDEX "bet_slips_user_id_status_idx" ON "public"."bet_slips"("user_id", "status");

-- CreateIndex
CREATE INDEX "bet_slips_league_id_created_at_idx" ON "public"."bet_slips"("league_id", "created_at");

-- CreateIndex
CREATE INDEX "settlements_user_id_league_id_idx" ON "public"."settlements"("user_id", "league_id");

-- CreateIndex
CREATE INDEX "settlements_bet_id_idx" ON "public"."settlements"("bet_id");

-- CreateIndex
CREATE INDEX "settlements_game_id_idx" ON "public"."settlements"("game_id");

-- CreateIndex
CREATE INDEX "settlements_created_at_idx" ON "public"."settlements"("created_at");

-- CreateIndex
CREATE INDEX "competitions_league_id_status_idx" ON "public"."competitions"("league_id", "status");

-- CreateIndex
CREATE INDEX "competitions_scope_status_idx" ON "public"."competitions"("scope", "status");

-- CreateIndex
CREATE INDEX "competitions_start_date_end_date_idx" ON "public"."competitions"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "competitions_created_by_idx" ON "public"."competitions"("created_by");

-- CreateIndex
CREATE INDEX "competition_entries_competition_id_rank_idx" ON "public"."competition_entries"("competition_id", "rank");

-- CreateIndex
CREATE INDEX "competition_entries_user_id_idx" ON "public"."competition_entries"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "competition_entries_competition_id_user_id_key" ON "public"."competition_entries"("competition_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "leaderboards_competition_id_key" ON "public"."leaderboards"("competition_id");

-- CreateIndex
CREATE INDEX "leaderboards_last_calculated_idx" ON "public"."leaderboards"("last_calculated");

-- CreateIndex
CREATE INDEX "achievements_user_id_type_idx" ON "public"."achievements"("user_id", "type");

-- CreateIndex
CREATE INDEX "achievements_league_id_idx" ON "public"."achievements"("league_id");

-- CreateIndex
CREATE INDEX "achievements_unlocked_at_idx" ON "public"."achievements"("unlocked_at");

-- CreateIndex
CREATE INDEX "competition_rewards_user_id_claimed_at_idx" ON "public"."competition_rewards"("user_id", "claimed_at");

-- CreateIndex
CREATE INDEX "competition_rewards_competition_id_placement_idx" ON "public"."competition_rewards"("competition_id", "placement");

-- CreateIndex
CREATE UNIQUE INDEX "competition_rewards_competition_id_user_id_reward_type_key" ON "public"."competition_rewards"("competition_id", "user_id", "reward_type");

-- AddForeignKey
ALTER TABLE "public"."leagues" ADD CONSTRAINT "leagues_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_members" ADD CONSTRAINT "league_members_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_members" ADD CONSTRAINT "league_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_members" ADD CONSTRAINT "league_members_league_id_espn_team_id_fkey" FOREIGN KEY ("league_id", "espn_team_id") REFERENCES "public"."league_teams"("league_id", "espn_team_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."espn_credentials" ADD CONSTRAINT "espn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."espn_credentials" ADD CONSTRAINT "espn_credentials_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_players" ADD CONSTRAINT "league_players_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_teams" ADD CONSTRAINT "league_teams_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_roster_spots" ADD CONSTRAINT "league_roster_spots_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "public"."league_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_roster_spots" ADD CONSTRAINT "league_roster_spots_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."league_players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_matchups" ADD CONSTRAINT "league_matchups_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_matchups" ADD CONSTRAINT "league_matchups_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "public"."league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_matchups" ADD CONSTRAINT "league_matchups_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "public"."league_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_agent_memory" ADD CONSTRAINT "league_agent_memory_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_historical_data" ADD CONSTRAINT "league_historical_data_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."import_checkpoints" ADD CONSTRAINT "import_checkpoints_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_archives" ADD CONSTRAINT "league_archives_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sync_metadata" ADD CONSTRAINT "sync_metadata_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_transactions" ADD CONSTRAINT "league_transactions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_player_stats" ADD CONSTRAINT "league_player_stats_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_identities" ADD CONSTRAINT "player_identities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_identity_mappings" ADD CONSTRAINT "player_identity_mappings_master_player_id_fkey" FOREIGN KEY ("master_player_id") REFERENCES "public"."player_identities"("master_player_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."player_identity_mappings" ADD CONSTRAINT "player_identity_mappings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_identities" ADD CONSTRAINT "team_identities_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_identity_mappings" ADD CONSTRAINT "team_identity_mappings_master_team_id_fkey" FOREIGN KEY ("master_team_id") REFERENCES "public"."team_identities"("master_team_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."team_identity_mappings" ADD CONSTRAINT "team_identity_mappings_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."identity_audit_log" ADD CONSTRAINT "identity_audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."all_time_records" ADD CONSTRAINT "all_time_records_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."all_time_records" ADD CONSTRAINT "all_time_records_previous_record_id_fkey" FOREIGN KEY ("previous_record_id") REFERENCES "public"."all_time_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."head_to_head_records" ADD CONSTRAINT "head_to_head_records_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."performance_trends" ADD CONSTRAINT "performance_trends_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."championship_records" ADD CONSTRAINT "championship_records_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."statistics_calculations" ADD CONSTRAINT "statistics_calculations_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."season_statistics" ADD CONSTRAINT "season_statistics_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."weekly_statistics" ADD CONSTRAINT "weekly_statistics_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."league_settings" ADD CONSTRAINT "league_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."system_config" ADD CONSTRAINT "system_config_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invitations" ADD CONSTRAINT "invitations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_conversations" ADD CONSTRAINT "agent_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."generated_content" ADD CONSTRAINT "generated_content_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."generated_content" ADD CONSTRAINT "generated_content_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."content_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."generated_content" ADD CONSTRAINT "generated_content_published_id_fkey" FOREIGN KEY ("published_id") REFERENCES "public"."blog_posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."blog_posts" ADD CONSTRAINT "blog_posts_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."content_schedules" ADD CONSTRAINT "content_schedules_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."content_schedules" ADD CONSTRAINT "content_schedules_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."content_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."content_templates" ADD CONSTRAINT "content_templates_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_messages" ADD CONSTRAINT "chat_messages_reply_to_id_fkey" FOREIGN KEY ("reply_to_id") REFERENCES "public"."chat_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chat_sessions" ADD CONSTRAINT "chat_sessions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_summons" ADD CONSTRAINT "agent_summons_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agent_summons" ADD CONSTRAINT "agent_summons_summoned_by_fkey" FOREIGN KEY ("summoned_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bankrolls" ADD CONSTRAINT "bankrolls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bankrolls" ADD CONSTRAINT "bankrolls_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bets" ADD CONSTRAINT "bets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bets" ADD CONSTRAINT "bets_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bets" ADD CONSTRAINT "bets_bankroll_id_fkey" FOREIGN KEY ("bankroll_id") REFERENCES "public"."bankrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bets" ADD CONSTRAINT "bets_bet_slip_id_fkey" FOREIGN KEY ("bet_slip_id") REFERENCES "public"."bet_slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bet_slips" ADD CONSTRAINT "bet_slips_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bet_slips" ADD CONSTRAINT "bet_slips_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."settlements" ADD CONSTRAINT "settlements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."settlements" ADD CONSTRAINT "settlements_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."competitions" ADD CONSTRAINT "competitions_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."competitions" ADD CONSTRAINT "competitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."competition_entries" ADD CONSTRAINT "competition_entries_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."competition_entries" ADD CONSTRAINT "competition_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."leaderboards" ADD CONSTRAINT "leaderboards_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."achievements" ADD CONSTRAINT "achievements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."achievements" ADD CONSTRAINT "achievements_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."competition_rewards" ADD CONSTRAINT "competition_rewards_competition_id_fkey" FOREIGN KEY ("competition_id") REFERENCES "public"."competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."competition_rewards" ADD CONSTRAINT "competition_rewards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
