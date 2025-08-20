-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

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

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" VARCHAR(255) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(255),
    "avatar_url" TEXT,
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

