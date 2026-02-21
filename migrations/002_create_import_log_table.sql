-- Create box_score_import_log table for tracking gap-fill discoveries
-- Logs when automated processes find and import games that were
-- missing from the scoreboard but found on team pages.

CREATE TABLE IF NOT EXISTS box_score_import_log (
  id SERIAL PRIMARY KEY,
  
  -- What was imported
  box_score_url TEXT NOT NULL,
  season VARCHAR(10) NOT NULL,
  league VARCHAR(20) NOT NULL,
  game_date DATE,
  away_team_name TEXT,
  home_team_name TEXT,
  away_score INTEGER,
  home_score INTEGER,
  
  -- How it was discovered
  source VARCHAR(50) NOT NULL DEFAULT 'gap-fill',  -- 'scoreboard', 'gap-fill', 'manual'
  job_name VARCHAR(100),                           -- scheduler job name e.g. 'gap-fill-nightly'
  lookback_days INTEGER,                           -- how many days back we were searching
  
  -- Import details
  player_count INTEGER DEFAULT 0,
  play_count INTEGER DEFAULT 0,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'imported',  -- 'imported', 'skipped', 'error'
  error_message TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying recent imports
CREATE INDEX IF NOT EXISTS idx_import_log_created ON box_score_import_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_log_source ON box_score_import_log(source, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_log_season ON box_score_import_log(season, league);
