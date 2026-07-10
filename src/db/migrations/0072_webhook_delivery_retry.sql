DROP INDEX IF EXISTS "webhook_delivery_records_webhook_event_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_delivery_records_webhook_event_unique" ON "webhook_delivery_records" USING btree ("webhook_id","event_key") WHERE "delivery_status" = 'delivered';
