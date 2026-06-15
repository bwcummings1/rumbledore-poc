UPDATE "ai_persona_card"
SET
  "enabled" = true,
  "performs_when" = '["post-odds-refresh cron", "bet.settled reactions", "arena.standings.swing recaps"]'::jsonb,
  "trigger_config" = jsonb_build_object(
    'cadences',
    jsonb_build_array('post-odds-refresh'),
    'events',
    jsonb_build_array('bet.settled', 'arena.standings.swing')
  ),
  "updated_at" = now()
WHERE "persona" = 'betting_advisor';
