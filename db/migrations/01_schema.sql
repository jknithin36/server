-- db/migrations/01_schema.sql
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  source TEXT,
  level TEXT NOT NULL CHECK (level IN ('federal','state','city')),
  jurisdiction JSONB,   -- { "state": "CA", "city": "Los Angeles" }
  conditions JSONB      -- arbitrary filters like { "employeesMin": 5, "requiresFood": true }
);
