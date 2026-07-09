CREATE UNIQUE INDEX "editorial_actions_correction_hash_unique"
ON "editorial_actions" USING btree (
  "league_id",
  "target_content_item_id",
  (("metadata"->>'correctionHash'))
)
WHERE "action" = 'correct'
  AND "target_content_item_id" IS NOT NULL
  AND "metadata" ? 'correctionHash';
