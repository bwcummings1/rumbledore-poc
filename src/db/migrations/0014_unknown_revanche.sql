CREATE TYPE "public"."betting_event_status" AS ENUM('scheduled', 'in_progress', 'final', 'postponed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."betting_market_period" AS ENUM('full_game');--> statement-breakpoint
CREATE TYPE "public"."betting_market_status" AS ENUM('open', 'suspended', 'settled', 'void');--> statement-breakpoint
CREATE TYPE "public"."betting_market_type" AS ENUM('moneyline', 'spread', 'total', 'player_prop');--> statement-breakpoint
CREATE TYPE "public"."betting_sport" AS ENUM('nfl');--> statement-breakpoint
CREATE TABLE "betting_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"sport" "betting_sport" DEFAULT 'nfl' NOT NULL,
	"home_team" text NOT NULL,
	"away_team" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"status" "betting_event_status" DEFAULT 'scheduled' NOT NULL,
	"home_score" integer,
	"away_score" integer,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "betting_market" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_market_id" text NOT NULL,
	"type" "betting_market_type" NOT NULL,
	"subject" text DEFAULT 'game' NOT NULL,
	"prop_type" text,
	"period" "betting_market_period" DEFAULT 'full_game' NOT NULL,
	"status" "betting_market_status" DEFAULT 'open' NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL,
	"content_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "odds_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"provider" text NOT NULL,
	"line" numeric(10, 2),
	"over_price" integer,
	"under_price" integer,
	"home_price" integer,
	"away_price" integer,
	"outcome_price" integer,
	"source_payload_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "betting_market" ADD CONSTRAINT "betting_market_event_id_betting_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."betting_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "odds_snapshot" ADD CONSTRAINT "odds_snapshot_market_id_betting_market_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."betting_market"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "betting_event_provider_event_unique" ON "betting_event" USING btree ("provider","provider_event_id");--> statement-breakpoint
CREATE INDEX "betting_event_sport_start_idx" ON "betting_event" USING btree ("sport","start_time");--> statement-breakpoint
CREATE INDEX "betting_event_status_start_idx" ON "betting_event" USING btree ("status","start_time");--> statement-breakpoint
CREATE UNIQUE INDEX "betting_market_provider_market_unique" ON "betting_market" USING btree ("provider","provider_market_id");--> statement-breakpoint
CREATE INDEX "betting_market_event_status_idx" ON "betting_market" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "betting_market_type_status_idx" ON "betting_market" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "odds_snapshot_market_captured_idx" ON "odds_snapshot" USING btree ("market_id","captured_at");--> statement-breakpoint
CREATE INDEX "odds_snapshot_hash_idx" ON "odds_snapshot" USING btree ("market_id","source_payload_hash");