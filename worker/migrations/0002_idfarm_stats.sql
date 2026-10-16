CREATE TABLE IF NOT EXISTS idfarm_lifetime_visitors (
  visitor_hash TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idfarm_daily_visitors (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);

CREATE TABLE IF NOT EXISTS idfarm_daily_counts (
  day TEXT PRIMARY KEY,
  visitor_count INTEGER NOT NULL DEFAULT 0 CHECK (visitor_count >= 0)
);

CREATE TABLE IF NOT EXISTS idfarm_global_counts (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  visitor_count INTEGER NOT NULL DEFAULT 0 CHECK (visitor_count >= 0)
);

INSERT OR IGNORE INTO idfarm_global_counts (id, visitor_count) VALUES (1, 0);

CREATE INDEX IF NOT EXISTS idx_idfarm_daily_visitors_day ON idfarm_daily_visitors(day);
