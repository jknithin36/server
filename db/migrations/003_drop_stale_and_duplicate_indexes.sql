-- Drop duplicate JSONB GIN using jsonb_path_ops (we keep the plain GIN).
DROP INDEX IF EXISTS idx_rules_conditions;

-- Drop the stale index on old column names (if it exists in your DB).
DROP INDEX IF EXISTS idx_rules_state_city;
