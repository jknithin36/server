-- Add missing columns if this table was created before we normalized jurisdiction
ALTER TABLE rules
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS city  TEXT;

-- If an old 'jurisdiction' JSONB column exists, backfill state/city once
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'rules' AND column_name = 'jurisdiction'
  ) THEN
    UPDATE rules
      SET state = COALESCE(state, NULLIF(jurisdiction->>'state','')),
          city  = COALESCE(city , NULLIF(jurisdiction->>'city',''))
    WHERE state IS NULL OR city IS NULL;
    -- Optional: drop the legacy column afterwards
    -- ALTER TABLE rules DROP COLUMN jurisdiction;
  END IF;
END $$;

-- Ensure these exist (harmless if already there)
ALTER TABLE rules
  ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Create helpful indexes (skip if already there)
CREATE INDEX IF NOT EXISTS idx_rules_level_state_city ON rules (level, state, city);
CREATE INDEX IF NOT EXISTS idx_rules_state_city       ON rules (state, city);
CREATE INDEX IF NOT EXISTS idx_rules_conditions_gin   ON rules USING GIN (conditions);
