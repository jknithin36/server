CREATE INDEX IF NOT EXISTS idx_rules_state_lcity
  ON rules (state, lower(city));
