-- CreateEnum
CREATE TYPE "mapping_method" AS ENUM ('AUTOMATIC', 'MANUAL', 'FUZZY_MATCH');

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('PLAYER', 'TEAM');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'MERGE', 'SPLIT', 'UPDATE', 'DELETE', 'ROLLBACK');

-- CreateTable
CREATE TABLE "player_identities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "master_player_id" UUID NOT NULL,
    "canonical_name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,
    "confidence_score" DOUBLE PRECISION NOT NULL DEFAULT 1.00,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "player_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_identity_mappings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "master_player_id" UUID NOT NULL,
    "espn_player_id" BIGINT NOT NULL,
    "season" INTEGER NOT NULL,
    "name_variation" VARCHAR(255) NOT NULL,
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "mapping_method" "mapping_method" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "player_identity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_identities" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "master_team_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "canonical_name" VARCHAR(255) NOT NULL,
    "owner_history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "team_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_identity_mappings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "master_team_id" UUID NOT NULL,
    "league_id" UUID NOT NULL,
    "espn_team_id" INTEGER NOT NULL,
    "season" INTEGER NOT NULL,
    "team_name" VARCHAR(255) NOT NULL,
    "owner_name" VARCHAR(255),
    "confidence_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_identity_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_audit_log" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "entity_type" "entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "action" "audit_action" NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "reason" TEXT,
    "performed_by" UUID,
    "performed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "player_identities_master_player_id_key" ON "player_identities"("master_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "player_identity_mappings_espn_player_id_season_key" ON "player_identity_mappings"("espn_player_id", "season");

-- CreateIndex
CREATE INDEX "player_identity_mappings_master_player_id_idx" ON "player_identity_mappings"("master_player_id");

-- CreateIndex
CREATE INDEX "player_identity_mappings_espn_player_id_idx" ON "player_identity_mappings"("espn_player_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_identities_master_team_id_key" ON "team_identities"("master_team_id");

-- CreateIndex
CREATE INDEX "team_identities_league_id_idx" ON "team_identities"("league_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_identity_mappings_league_id_espn_team_id_season_key" ON "team_identity_mappings"("league_id", "espn_team_id", "season");

-- CreateIndex
CREATE INDEX "team_identity_mappings_master_team_id_idx" ON "team_identity_mappings"("master_team_id");

-- CreateIndex
CREATE INDEX "team_identity_mappings_league_id_idx" ON "team_identity_mappings"("league_id");

-- CreateIndex
CREATE INDEX "identity_audit_log_entity_type_entity_id_idx" ON "identity_audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "identity_audit_log_performed_by_idx" ON "identity_audit_log"("performed_by");

-- AddForeignKey
ALTER TABLE "player_identities" ADD CONSTRAINT "player_identities_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_identity_mappings" ADD CONSTRAINT "player_identity_mappings_master_player_id_fkey" FOREIGN KEY ("master_player_id") REFERENCES "player_identities"("master_player_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_identity_mappings" ADD CONSTRAINT "player_identity_mappings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_identities" ADD CONSTRAINT "team_identities_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_identity_mappings" ADD CONSTRAINT "team_identity_mappings_master_team_id_fkey" FOREIGN KEY ("master_team_id") REFERENCES "team_identities"("master_team_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_identity_mappings" ADD CONSTRAINT "team_identity_mappings_league_id_fkey" FOREIGN KEY ("league_id") REFERENCES "leagues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_audit_log" ADD CONSTRAINT "identity_audit_log_performed_by_fkey" FOREIGN KEY ("performed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;