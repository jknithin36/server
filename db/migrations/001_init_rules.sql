-- Create table if not exists
CREATE TABLE IF NOT EXISTS rules (
  id          text PRIMARY KEY,
  title       text NOT NULL,
  summary     text,
  source      text,
  level       text NOT NULL CHECK (level IN ('federal','state','city')),
  state       text,  -- nullable for federal rules
  city        text,  -- nullable unless level='city'
  conditions  jsonb  NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- If you previously had a 'jurisdiction' JSONB column, keep this ALTER as a guard.
-- (No-op if column doesn't exist.)
-- DO NOT FAIL if missing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='rules' AND column_name='jurisdiction'
  ) THEN
    -- backfill state/city once
    UPDATE rules
      SET state = COALESCE(state, (jurisdiction->>'state')),
          city  = COALESCE(city , (jurisdiction->>'city'))
    WHERE (jurisdiction->>'state') IS NOT NULL
       OR (jurisdiction->>'city')  IS NOT NULL;
    -- optional: drop old column
    -- ALTER TABLE rules DROP COLUMN jurisdiction;
  END IF;
END$$;

-- Helpful indexes (fast lookups at scale)
CREATE INDEX IF NOT EXISTS idx_rules_level_state_city
  ON rules (level, state, city);

CREATE INDEX IF NOT EXISTS idx_rules_state_city
  ON rules (state, city);

-- JSONB GIN index for conditions queries (if you push filters into SQL later)
CREATE INDEX IF NOT EXISTS idx_rules_conditions_gin
  ON rules USING GIN (conditions);

-- Last-touched title/source text search (optional)
CREATE INDEX IF NOT EXISTS idx_rules_title_trgm
  ON rules USING GIN (title gin_trgm_ops);
