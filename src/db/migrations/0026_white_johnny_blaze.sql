ALTER TABLE "historical_import_checkpoints" ADD COLUMN IF NOT EXISTS "cursor" jsonb DEFAULT '{}'::jsonb NOT NULL;
