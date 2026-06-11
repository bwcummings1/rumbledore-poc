CREATE TABLE "league_feed_reference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"league_id" uuid NOT NULL,
	"content_item_id" uuid NOT NULL,
	"relevance_score" double precision DEFAULT 1 NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"framing_title" text,
	"framing_summary" text,
	"matched_entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "league_feed_reference" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_feed_reference" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "league_feed_reference" ADD CONSTRAINT "league_feed_reference_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "league_feed_reference" ADD CONSTRAINT "league_feed_reference_content_item_id_content_item_id_fk" FOREIGN KEY ("content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "league_feed_reference_identity_unique" ON "league_feed_reference" USING btree ("league_id","content_item_id");--> statement-breakpoint
CREATE INDEX "league_feed_reference_league_score_idx" ON "league_feed_reference" USING btree ("league_id","relevance_score","created_at");--> statement-breakpoint
CREATE POLICY "league_feed_reference_isolation" ON "league_feed_reference" AS PERMISSIVE FOR ALL TO public USING ("league_feed_reference"."league_id" = current_league_id()) WITH CHECK ("league_feed_reference"."league_id" = current_league_id());
