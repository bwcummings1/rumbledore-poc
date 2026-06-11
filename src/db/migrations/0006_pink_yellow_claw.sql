CREATE TYPE "public"."onboarding_browser_session_status" AS ENUM('awaiting_login', 'connected', 'failed', 'ended');--> statement-breakpoint
CREATE TYPE "public"."onboarding_connection_flow" AS ENUM('browser', 'manual', 'extension');--> statement-breakpoint
CREATE TYPE "public"."onboarding_credential_status" AS ENUM('connected', 'invalid');--> statement-breakpoint
CREATE TABLE "onboarding_browser_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"status" "onboarding_browser_session_status" DEFAULT 'awaiting_login' NOT NULL,
	"live_view_url" text NOT NULL,
	"credential_id" uuid,
	"error_code" text,
	"expires_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_discovered_leagues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credential_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"provider_league_id" text NOT NULL,
	"season" integer NOT NULL,
	"sport" "fantasy_sport" DEFAULT 'unknown' NOT NULL,
	"name" text NOT NULL,
	"team_name" text,
	"size" integer,
	"last_discovered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "fantasy_provider" NOT NULL,
	"subject_provider_id" text NOT NULL,
	"encrypted_payload" text NOT NULL,
	"status" "onboarding_credential_status" DEFAULT 'connected' NOT NULL,
	"connection_flow" "onboarding_connection_flow" NOT NULL,
	"last_validated_at" timestamp with time zone NOT NULL,
	"invalid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "onboarding_browser_sessions" ADD CONSTRAINT "onboarding_browser_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_browser_sessions" ADD CONSTRAINT "onboarding_browser_sessions_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD CONSTRAINT "onboarding_discovered_leagues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_discovered_leagues" ADD CONSTRAINT "onboarding_discovered_leagues_credential_id_provider_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."provider_credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onboarding_browser_sessions_user_status_idx" ON "onboarding_browser_sessions" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_discovered_leagues_user_identity_unique" ON "onboarding_discovered_leagues" USING btree ("user_id","provider","provider_league_id","season");--> statement-breakpoint
CREATE INDEX "onboarding_discovered_leagues_credential_idx" ON "onboarding_discovered_leagues" USING btree ("credential_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_credentials_user_provider_subject_unique" ON "provider_credentials" USING btree ("user_id","provider","subject_provider_id");--> statement-breakpoint
CREATE INDEX "provider_credentials_user_provider_idx" ON "provider_credentials" USING btree ("user_id","provider");