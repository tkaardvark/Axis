/**
 * Experimental: Create Box Score Tables Migration
 *
 * Creates new tables for per-game box score and play-by-play data.
 * All tables are prefixed with `exp_` to avoid any collision with
 * the existing production tables.
 *
 * Usage:
 *   node experimental/migrate-create-tables.js          # Create tables
 *   node experimental/migrate-create-tables.js --drop   # Drop experimental tables
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false,
});

const CREATE_TABLES_SQL = `
-- ============================================================
-- exp_game_box_scores: One row per game (not per team)
-- Stores game-level metadata, score by period, and team totals
-- ============================================================
CREATE TABLE IF NOT EXISTS exp_game_box_scores (
  id                    SERIAL PRIMARY KEY,
  box_score_url         TEXT NOT NULL,           -- e.g., /sports/mbkb/2025-26/boxscores/20260217_nysm.xml
  season                VARCHAR(10) NOT NULL,    -- e.g., 2025-26
  league                VARCHAR(10) NOT NULL,    -- mens or womens
  game_date             DATE NOT NULL,

  -- Game type flags (from scoreboard CSS classes)
  is_conference         BOOLEAN NOT NULL DEFAULT false,
  is_division           BOOLEAN NOT NULL DEFAULT false,
  is_exhibition         BOOLEAN NOT NULL DEFAULT false,
  is_postseason         BOOLEAN NOT NULL DEFAULT false,

  -- Away team (visitor)
  away_team_name        VARCHAR(255),
  away_team_id          VARCHAR(50),             -- Presto Sports team ID if discoverable
  away_team_record      VARCHAR(20),             -- e.g., (12-15, 5-10)
  away_score            INTEGER,

  -- Home team
  home_team_name        VARCHAR(255),
  home_team_id          VARCHAR(50),
  home_team_record      VARCHAR(20),
  home_score            INTEGER,

  -- Score by period (JSONB for flexibility: [32, 29] or [32, 29, 10] for OT)
  away_period_scores    JSONB,                   -- e.g., [32, 29]
  home_period_scores    JSONB,                   -- e.g., [46, 48]

  -- Game metadata
  status                VARCHAR(50),             -- Final, Final - OT, Final - Forfeit, etc.
  num_periods           INTEGER DEFAULT 2,       -- 2 = regulation, 3+ = OT
  location_text         VARCHAR(255),            -- Venue/location if available
  attendance            INTEGER,
  ties                  INTEGER,                 -- Number of ties during game
  lead_changes          INTEGER,                 -- Number of lead changes

  -- Team totals (away)
  away_fgm              INTEGER,
  away_fga              INTEGER,
  away_fg_pct           DECIMAL(5,3),
  away_fgm3             INTEGER,
  away_fga3             INTEGER,
  away_fg3_pct          DECIMAL(5,3),
  away_ftm              INTEGER,
  away_fta              INTEGER,
  away_ft_pct           DECIMAL(5,3),
  away_oreb             INTEGER,
  away_dreb             INTEGER,
  away_reb              INTEGER,
  away_ast              INTEGER,
  away_stl              INTEGER,
  away_blk              INTEGER,
  away_to               INTEGER,
  away_pf               INTEGER,
  away_pts              INTEGER,

  -- Team totals (home)
  home_fgm              INTEGER,
  home_fga              INTEGER,
  home_fg_pct           DECIMAL(5,3),
  home_fgm3             INTEGER,
  home_fga3             INTEGER,
  home_fg3_pct          DECIMAL(5,3),
  home_ftm              INTEGER,
  home_fta              INTEGER,
  home_ft_pct           DECIMAL(5,3),
  home_oreb             INTEGER,
  home_dreb             INTEGER,
  home_reb              INTEGER,
  home_ast              INTEGER,
  home_stl              INTEGER,
  home_blk              INTEGER,
  home_to               INTEGER,
  home_pf               INTEGER,
  home_pts              INTEGER,

  -- Team comparison stats (from Team Stats tab)
  away_points_in_paint       INTEGER,
  away_fastbreak_points      INTEGER,
  away_bench_points          INTEGER,
  away_second_chance_points  INTEGER,
  away_points_off_turnovers  INTEGER,
  away_largest_lead          INTEGER,
  away_time_of_largest_lead  VARCHAR(20),

  home_points_in_paint       INTEGER,
  home_fastbreak_points      INTEGER,
  home_bench_points          INTEGER,
  home_second_chance_points  INTEGER,
  home_points_off_turnovers  INTEGER,
  home_largest_lead          INTEGER,
  home_time_of_largest_lead  VARCHAR(20),

  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW(),

  UNIQUE(box_score_url, season)
);

CREATE INDEX IF NOT EXISTS idx_exp_gbs_date ON exp_game_box_scores(game_date);
CREATE INDEX IF NOT EXISTS idx_exp_gbs_season ON exp_game_box_scores(season);
CREATE INDEX IF NOT EXISTS idx_exp_gbs_away_team ON exp_game_box_scores(away_team_id);
CREATE INDEX IF NOT EXISTS idx_exp_gbs_home_team ON exp_game_box_scores(home_team_id);
CREATE INDEX IF NOT EXISTS idx_exp_gbs_type ON exp_game_box_scores(is_conference, is_exhibition, is_postseason);

-- ============================================================
-- exp_player_game_stats: One row per player per game
-- Per-game individual box score line
-- ============================================================
CREATE TABLE IF NOT EXISTS exp_player_game_stats (
  id                    SERIAL PRIMARY KEY,
  game_box_score_id     INTEGER REFERENCES exp_game_box_scores(id) ON DELETE CASCADE,
  box_score_url         TEXT NOT NULL,            -- Denormalized for easy lookup
  season                VARCHAR(10) NOT NULL,

  -- Player identity
  player_name           VARCHAR(255) NOT NULL,
  player_url            TEXT,                     -- Relative URL to player page (contains player ID)
  player_id             VARCHAR(50),              -- Extracted from player URL
  uniform_number        VARCHAR(10),
  team_name             VARCHAR(255),
  team_id               VARCHAR(50),
  is_home               BOOLEAN NOT NULL,         -- true = home team, false = away
  is_starter            BOOLEAN NOT NULL,         -- true = starter, false = bench

  -- Stats
  minutes               INTEGER,
  fgm                   INTEGER,
  fga                   INTEGER,
  fgm3                  INTEGER,
  fga3                  INTEGER,
  ftm                   INTEGER,
  fta                   INTEGER,
  oreb                  INTEGER,
  dreb                  INTEGER,
  reb                   INTEGER,
  ast                   INTEGER,
  stl                   INTEGER,
  blk                   INTEGER,
  turnovers             INTEGER,
  pf                    INTEGER,
  pts                   INTEGER,

  created_at            TIMESTAMP DEFAULT NOW(),

  UNIQUE(box_score_url, player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_exp_pgs_game ON exp_player_game_stats(game_box_score_id);
CREATE INDEX IF NOT EXISTS idx_exp_pgs_player ON exp_player_game_stats(player_id);
CREATE INDEX IF NOT EXISTS idx_exp_pgs_team ON exp_player_game_stats(team_id);
CREATE INDEX IF NOT EXISTS idx_exp_pgs_season ON exp_player_game_stats(season);

-- ============================================================
-- exp_play_by_play: One row per play event
-- Timestamped game events with running score
-- ============================================================
CREATE TABLE IF NOT EXISTS exp_play_by_play (
  id                    SERIAL PRIMARY KEY,
  game_box_score_id     INTEGER REFERENCES exp_game_box_scores(id) ON DELETE CASCADE,
  box_score_url         TEXT NOT NULL,
  season                VARCHAR(10) NOT NULL,

  -- Play info
  period                INTEGER NOT NULL,          -- 1, 2, 3 (OT1), 4 (OT2), etc.
  game_clock            VARCHAR(10),               -- e.g., "19:40"
  sequence_number       INTEGER NOT NULL,          -- Order within the game (1, 2, 3...)

  -- Who did what
  team_name             VARCHAR(255),
  team_id               VARCHAR(50),
  is_home               BOOLEAN,                   -- true = home team play
  player_name           VARCHAR(255),              -- May be null for team events
  action_text           TEXT NOT NULL,              -- Raw text: "JONES,MIKE made layup"

  -- Categorized action (parsed from action_text)
  action_type           VARCHAR(50),               -- made_fg, missed_fg, made_3pt, missed_3pt,
                                                   -- made_ft, missed_ft, rebound_off, rebound_def,
                                                   -- assist, steal, block, turnover, foul, 
                                                   -- substitution, timeout, etc.
  is_scoring_play       BOOLEAN DEFAULT FALSE,

  -- Running score after this play
  away_score            INTEGER,
  home_score            INTEGER,

  created_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exp_pbp_game ON exp_play_by_play(game_box_score_id);
CREATE INDEX IF NOT EXISTS idx_exp_pbp_period ON exp_play_by_play(period);
CREATE INDEX IF NOT EXISTS idx_exp_pbp_team ON exp_play_by_play(team_id);
CREATE INDEX IF NOT EXISTS idx_exp_pbp_type ON exp_play_by_play(action_type);
CREATE INDEX IF NOT EXISTS idx_exp_pbp_season ON exp_play_by_play(season);
CREATE INDEX IF NOT EXISTS idx_exp_pbp_sequence ON exp_play_by_play(game_box_score_id, sequence_number);
`;

const DROP_TABLES_SQL = `
DROP TABLE IF EXISTS exp_play_by_play CASCADE;
DROP TABLE IF EXISTS exp_player_game_stats CASCADE;
DROP TABLE IF EXISTS exp_game_box_scores CASCADE;
`;

async function main() {
  const shouldDrop = process.argv.includes('--drop');

  const client = await pool.connect();
  try {
    if (shouldDrop) {
      console.log('⚠️  Dropping all experimental tables...');
      await client.query(DROP_TABLES_SQL);
      console.log('✅ All exp_ tables dropped.');
    } else {
      console.log('Creating experimental tables (exp_ prefix)...');
      await client.query(CREATE_TABLES_SQL);
      console.log('✅ exp_game_box_scores created');
      console.log('✅ exp_player_game_stats created');
      console.log('✅ exp_play_by_play created');
      console.log('\nAll experimental tables ready. Existing tables untouched.');
    }
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
