-- Create normalized rules table (safe to re-run)
CREATE TABLE IF NOT EXISTS rules (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  summary       TEXT,
  source        TEXT,
  level         TEXT NOT NULL CHECK (level IN ('federal','state','city')),
  state         TEXT,   -- null for federal
  city          TEXT,   -- null unless level='city'
  conditions    JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Matching & scale
CREATE INDEX IF NOT EXISTS idx_rules_level_state_city ON rules (level, state, city);
CREATE INDEX IF NOT EXISTS idx_rules_state_city       ON rules (state, city);
CREATE INDEX IF NOT EXISTS idx_rules_conditions_gin   ON rules USING GIN (conditions);

-- Optional fuzzy search (safe if pg_trgm missing)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm') THEN
    CREATE EXTENSION IF NOT EXISTS pg_trgm;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_rules_title_trgm ON rules USING GIN (title gin_trgm_ops);
