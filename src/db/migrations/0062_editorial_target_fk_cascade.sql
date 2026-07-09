ALTER TABLE "editorial_actions" DROP CONSTRAINT "editorial_actions_target_content_item_id_content_item_id_fk";--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_target_content_item_id_content_item_id_fk" FOREIGN KEY ("target_content_item_id") REFERENCES "public"."content_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editorial_actions" DROP CONSTRAINT "editorial_actions_target_persona_card_id_ai_persona_card_id_fk";--> statement-breakpoint
ALTER TABLE "editorial_actions" ADD CONSTRAINT "editorial_actions_target_persona_card_id_ai_persona_card_id_fk" FOREIGN KEY ("target_persona_card_id") REFERENCES "public"."ai_persona_card"("id") ON DELETE cascade ON UPDATE no action;
